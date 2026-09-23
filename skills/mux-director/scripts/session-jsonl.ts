#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function filesUnder(root: string, accepts: (file: string) => boolean): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && accepts(candidate)) files.push(candidate);
    }
  }
  return files;
}

function firstJsonLine(file: string): unknown {
  const descriptor = openSync(file, "r");
  try {
    const chunks: Buffer[] = [];
    let position = 0;
    while (true) {
      const chunk = Buffer.alloc(4096);
      const count = readSync(descriptor, chunk, 0, chunk.length, position);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      const text = Buffer.concat(chunks).toString("utf8");
      const newline = text.indexOf("\n");
      if (newline >= 0) return JSON.parse(text.slice(0, newline));
      position += count;
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    closeSync(descriptor);
  }
}

function requireOne(label: string, matches: string[], repository: string, sessionId?: string): string {
  if (matches.length === 1) return matches[0]!;
  const detail = `cwd=${repository}${sessionId ? ` session=${sessionId}` : ""}`;
  const reason = matches.length === 0 ? "No" : `Ambiguous (${matches.length})`;
  fail(
    `${reason} ${label} transcript matches for ${detail}.\n` +
      "Ask the idle reviewer for its exact transcript path; do not guess by modification time.",
    3,
  );
}

function resolveTranscriptPath(provider: string, repositoryInput: string, sessionId?: string): string {
  const repository = realpathSync(repositoryInput);
  if (provider === "codex") {
    const root = path.join(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"), "sessions");
    const matches = filesUnder(root, (file) => file.endsWith(".jsonl")).filter((file) => {
      try {
        const row = firstJsonLine(file) as {
          type?: string;
          payload?: { cwd?: string; id?: string; session_id?: string };
        };
        const id = row.payload?.id ?? row.payload?.session_id;
        return row.type === "session_meta" && row.payload?.cwd === repository && (!sessionId || id === sessionId);
      } catch {
        return false;
      }
    });
    return requireOne("Codex", matches, repository, sessionId);
  }

  if (provider === "grok") {
    const root = process.env.GROK_HOME ?? path.join(homedir(), ".grok");
    const registryFile = path.join(root, "active_sessions.json");
    if (!existsSync(registryFile)) fail(`Grok active-session registry not found: ${registryFile}`);
    const registry = JSON.parse(readFileSync(registryFile, "utf8")) as Array<{
      cwd?: string;
      session_id?: string;
    }>;
    const ids = registry
      .filter((entry) => entry.cwd === repository && (!sessionId || entry.session_id === sessionId))
      .map((entry) => entry.session_id)
      .filter((id): id is string => Boolean(id));
    const id = requireOne("active Grok", ids, repository, sessionId);
    const matches = filesUnder(path.join(root, "sessions"), (file) =>
      file.endsWith(path.join(id, "chat_history.jsonl")),
    );
    return requireOne("Grok", matches, repository, sessionId);
  }

  // Claude (Opus/Sonnet/etc.) Code project transcripts: one JSONL file per
  // session under ~/.claude/projects/<cwd-with-slashes-as-dashes>/<session-id>.jsonl.
  // Resolve by repository (+ optional session id); require exactly one match so a
  // stale guess by modification time is never silently adopted.
  if (provider === "claude") {
    const root = process.env.CLAUDE_PROJECTS_DIR ?? path.join(homedir(), ".claude", "projects");
    const encoded = repository.replace(/\//g, "-");
    const projectDir = path.join(root, encoded);
    if (!existsSync(projectDir)) {
      fail(`No Claude project dir for ${repository} (expected ${projectDir}).`, 3);
    }
    const matches = readdirSync(projectDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(projectDir, entry.name))
      .filter((file) => {
        if (!sessionId) return true;
        return path.basename(file).replace(/\.jsonl$/, "") === sessionId;
      });
    return requireOne("Claude", matches, repository, sessionId);
  }

  fail(`Unknown provider: ${provider} (use codex, grok, or claude)`, 2);
}

function resolveSession(provider: string, repositoryInput: string, sessionId?: string): void {
  process.stdout.write(`${resolveTranscriptPath(provider, repositoryInput, sessionId)}\n`);
}

function writeCursor(cursorFile: string, offset: number): void {
  mkdirSync(path.dirname(path.resolve(cursorFile)), { recursive: true });
  writeFileSync(cursorFile, `${offset}\n`);
}

function seedSession(transcript: string, cursorFile: string): void {
  if (!existsSync(transcript)) fail(`Transcript not found: ${transcript}`);
  const offset = statSync(transcript).size;
  writeCursor(cursorFile, offset);
  process.stdout.write(`Seeded cursor at byte ${offset}.\n`);
}

function readCursor(cursorFile: string): number {
  if (!existsSync(cursorFile)) return 0;
  const value = Number.parseInt(readFileSync(cursorFile, "utf8").trim(), 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function assistantText(provider: string, row: unknown): string[] {
  const record = row as {
    type?: string;
    content?: unknown;
    message?: { role?: string; content?: Array<{ type?: string; text?: string }> };
    payload?: { type?: string; role?: string; content?: Array<{ type?: string; text?: string }> };
  };
  if (provider === "codex") {
    if (record.type !== "response_item" || record.payload?.type !== "message" || record.payload.role !== "assistant") {
      return [];
    }
    return (record.payload.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text!);
  }
  if (provider === "grok" && record.type === "assistant") {
    if (typeof record.content === "string") return [record.content];
    if (Array.isArray(record.content)) {
      return record.content.flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") return [item.text];
        return [];
      });
    }
    return [];
  }
  // Claude (Opus/Sonnet/etc.) project transcripts: one JSONL row per event.
  // Assistant turns are `type === "assistant"` with `message.role === "assistant"`
  // and `message.content` an array of typed blocks. Only `text` blocks carry the
  // model's final emitted text; `tool_use`, `thinking`, and other blocks are
  // excluded so only provider-emitted final text is returned (matching Codex/Grok).
  if (provider === "claude" && record.type === "assistant" && record.message?.role === "assistant") {
    if (!Array.isArray(record.message.content)) return [];
    return record.message.content
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text!);
  }
  if (provider !== "codex" && provider !== "grok" && provider !== "claude") {
    fail(`Unknown provider: ${provider} (use codex, grok, or claude)`, 2);
  }
  return [];
}

// Reads appended, complete JSONL rows since the cursor and returns the assistant
// output_text messages they contain. Advances the cursor past every complete line
// so a later call only sees newly appended content. Reasoning/interim rows are
// excluded by assistantText, so only provider-emitted final text is returned.
function readAppendedAssistantTexts(provider: string, transcript: string, cursorFile: string): string[] {
  if (!existsSync(transcript)) fail(`Transcript not found: ${transcript}`);
  const size = statSync(transcript).size;
  let offset = readCursor(cursorFile);
  if (offset > size) offset = 0;
  if (offset === size) return [];

  const descriptor = openSync(transcript, "r");
  let bytes: Buffer;
  try {
    bytes = Buffer.alloc(size - offset);
    readSync(descriptor, bytes, 0, bytes.length, offset);
  } finally {
    closeSync(descriptor);
  }

  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) return [];
  const complete = bytes.subarray(0, lastNewline + 1).toString("utf8");
  const texts: string[] = [];
  for (const line of complete.split("\n")) {
    if (!line.trim()) continue;
    try {
      texts.push(...assistantText(provider, JSON.parse(line)));
    } catch {
      // Provider logs may contain an isolated malformed row. Preserve cursor progress
      // across complete lines and continue reading later valid messages.
    }
  }
  writeCursor(cursorFile, offset + lastNewline + 1);
  return texts;
}

function readSession(provider: string, transcript: string, cursorFile: string): void {
  for (const text of readAppendedAssistantTexts(provider, transcript, cursorFile)) {
    process.stdout.write(`${text}\n`);
  }
}

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1_000));

// Polls a resolved provider transcript until a final assistant message appears
// AND the file stops growing for one interval (quiescence = the agent went idle),
// then exits 0 and prints the final message. Exits non-zero on timeout with an
// honest "incomplete" message; never claims completion without evidence.
//
// Local Codex/Grok sessions only. ChatGPT browser targets have no local JSONL
// and their DOM must not be auto-classified as complete; see the mux-director
// skill (no ChatGPT waiter by design).
async function waitSession(
  provider: string,
  repository: string,
  sessionId: string | undefined,
  cursorFile: string,
  maxSeconds: number,
  intervalSeconds: number,
): Promise<void> {
  const transcript = resolveTranscriptPath(provider, repository, sessionId);
  const deadline = Date.now() + maxSeconds * 1_000;
  // Accumulate every final assistant message seen since the wait started. The
  // detection read advances the cursor, so we cannot re-read on completion;
  // we print this accumulated buffer instead.
  const finalTexts: string[] = [];
  let sizeAtLastRead = statSync(transcript).size;
  for (;;) {
    const texts = readAppendedAssistantTexts(provider, transcript, cursorFile);
    if (texts.length > 0) finalTexts.push(...texts);
    if (finalTexts.length > 0) {
      // A final message has appeared. Wait one interval and check whether the
      // transcript kept growing; if it stopped, the agent went idle.
      await sleep(intervalSeconds);
      if (Date.now() >= deadline) break;
      const sizeAfter = existsSync(transcript) ? statSync(transcript).size : sizeAtLastRead;
      if (sizeAfter === sizeAtLastRead) {
        for (const text of finalTexts) process.stdout.write(`${text}\n`);
        process.exitCode = 0;
        return;
      }
      sizeAtLastRead = sizeAfter;
    } else {
      sizeAtLastRead = existsSync(transcript) ? statSync(transcript).size : sizeAtLastRead;
      if (Date.now() >= deadline) break;
      await sleep(intervalSeconds);
    }
  }
  // The cursor already consumed these messages. Return them even on timeout;
  // the non-zero exit still means completion has not been established.
  for (const text of finalTexts) process.stdout.write(`${text}\n`);
  fail(`incomplete: no idle final assistant message after ${maxSeconds}s on ${provider} session`, 1);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "path":
      if (args.length < 2 || args.length > 3) fail("Usage: session-jsonl.ts path <codex|grok|claude> <repository> [session-id]", 2);
      resolveSession(args[0]!, args[1]!, args[2]);
      break;
    case "seed":
      if (args.length !== 2) fail("Usage: session-jsonl.ts seed <transcript.jsonl> <cursor-file>", 2);
      seedSession(args[0]!, args[1]!);
      break;
    case "read":
      if (args.length !== 3) fail("Usage: session-jsonl.ts read <codex|grok|claude> <transcript.jsonl> <cursor-file>", 2);
      readSession(args[0]!, args[1]!, args[2]!);
      break;
    case "wait": {
      // session-jsonl.ts wait <codex|grok|claude> <repository> [session-id] [--cursor <file>] [--max <s>] [--interval <s>]
      const positionals: string[] = [];
      let cursorFile = "";
      let maxSeconds = 300;
      let intervalSeconds = 15;
      for (let i = 0; i < args.length; i += 1) {
        const arg = args[i]!;
        if (arg === "--cursor" || arg === "--max" || arg === "--interval") {
          const value = args[i + 1];
          if (value === undefined) fail(`Usage: session-jsonl.ts wait ... ${arg} <value>`, 2);
          i += 1;
          if (arg === "--cursor") cursorFile = value;
          else {
            const n = Number(value);
            if (!Number.isInteger(n) || n < 0) fail(`${arg} must be a non-negative integer: ${value}`, 2);
            if (arg === "--max") maxSeconds = n;
            else intervalSeconds = n;
          }
        } else positionals.push(arg);
      }
      if (positionals.length < 2 || positionals.length > 3) {
        fail(
          "Usage: session-jsonl.ts wait <codex|grok|claude> <repository> [session-id] [--cursor <file>] [--max <s>] [--interval <s>]",
          2,
        );
      }
      const [provider, repository, sessionId] = positionals;
      if (!cursorFile) cursorFile = path.join(process.env.HOME ?? homedir(), ".cache", "mux-director", `wait-${provider}.cursor`);
      await waitSession(provider!, repository!, sessionId, cursorFile, maxSeconds, intervalSeconds);
      break;
    }
    default:
      fail("Usage: session-jsonl.ts <path|seed|read|wait> ...", 2);
  }
}

await main();
