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

function resolveSession(provider: string, repositoryInput: string, sessionId?: string): void {
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
    process.stdout.write(`${requireOne("Codex", matches, repository, sessionId)}\n`);
    return;
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
    process.stdout.write(`${requireOne("Grok", matches, repository, sessionId)}\n`);
    return;
  }

  fail(`Unknown provider: ${provider} (use codex or grok)`, 2);
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
  if (provider !== "codex" && provider !== "grok") fail(`Unknown provider: ${provider} (use codex or grok)`, 2);
  return [];
}

function readSession(provider: string, transcript: string, cursorFile: string): void {
  if (!existsSync(transcript)) fail(`Transcript not found: ${transcript}`);
  const size = statSync(transcript).size;
  let offset = readCursor(cursorFile);
  if (offset > size) offset = 0;
  if (offset === size) return;

  const descriptor = openSync(transcript, "r");
  let bytes: Buffer;
  try {
    bytes = Buffer.alloc(size - offset);
    readSync(descriptor, bytes, 0, bytes.length, offset);
  } finally {
    closeSync(descriptor);
  }

  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline < 0) return;
  const complete = bytes.subarray(0, lastNewline + 1).toString("utf8");
  for (const line of complete.split("\n")) {
    if (!line.trim()) continue;
    try {
      for (const text of assistantText(provider, JSON.parse(line))) process.stdout.write(`${text}\n`);
    } catch {
      // Provider logs may contain an isolated malformed row. Preserve cursor progress
      // across complete lines and continue reading later valid messages.
    }
  }
  writeCursor(cursorFile, offset + lastNewline + 1);
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "path":
    if (args.length < 2 || args.length > 3) fail("Usage: session-jsonl.ts path <codex|grok> <repository> [session-id]", 2);
    resolveSession(args[0]!, args[1]!, args[2]);
    break;
  case "seed":
    if (args.length !== 2) fail("Usage: session-jsonl.ts seed <transcript.jsonl> <cursor-file>", 2);
    seedSession(args[0]!, args[1]!);
    break;
  case "read":
    if (args.length !== 3) fail("Usage: session-jsonl.ts read <codex|grok> <transcript.jsonl> <cursor-file>", 2);
    readSession(args[0]!, args[1]!, args[2]!);
    break;
  default:
    fail("Usage: session-jsonl.ts <path|seed|read> ...", 2);
}
