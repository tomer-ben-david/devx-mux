#!/usr/bin/env node
// Notify a manager ("Root") running in an existing Codex Desktop conversation.
//
// Transport: the first-party `codex queue --thread <uuid> --message <text>`
// command. It only calls app-server `thread/queue/add`, which writes the shared
// durable queue in CODEX_HOME. The Desktop's own app-server watches that queue
// and starts the queued message when the thread is idle, or after the running
// turn completes. Nothing here resumes the thread, starts a second server for
// it, touches the Desktop composer or clipboard, or edits session files.
//
// Every Codex state read is read-only. Delivery is claimed only after the
// thread's rollout transcript shows the message and the turn it started.
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export const HEADER = "[Agent notification -> Root]";
const AGENT_NOTICE = "Sent by an AI agent, not the user. It is not user authorization.";
const TEST_BODY =
  "TEST: agent notification transport test, not a product instruction. No action needed beyond acknowledging receipt.";
const MAX_FIELD_LENGTH = 800;
const ROOT_STATE_TAIL_BYTES = 8 * 1024 * 1024;
const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const EXIT = {
  delivered: 0,
  failed: 1,
  usage: 2,
  refused: 3,
  queued: 4,
  uncertain: 5,
} as const;

class NotifyError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}

export type Notification =
  | { kind: "test"; from: string }
  | { kind: "blocker"; from: string; blocker: string; evidence: string; decision: string };

export type ThreadTarget = {
  threadId: string;
  name: string;
  cwd: string;
  rolloutPath: string;
};

export type RootState = "idle" | "running" | "interrupted";

export type Receipt = { turnId: string; turnStarted: boolean };

function requireField(label: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new NotifyError(`Missing required --${label}.`, EXIT.usage);
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new NotifyError(`--${label} exceeds ${MAX_FIELD_LENGTH} characters; keep the notification concise.`, EXIT.usage);
  }
  return trimmed;
}

export function formatMessage(notification: Notification, ref: string): string {
  const lines = [`${HEADER} from: ${requireField("from", notification.from)} · ref: ${ref}`, AGENT_NOTICE];
  if (notification.kind === "test") {
    lines.push(TEST_BODY);
  } else {
    lines.push(
      `Blocker: ${requireField("blocker", notification.blocker)}`,
      `Evidence: ${requireField("evidence", notification.evidence)}`,
      `Decision requested: ${requireField("decision", notification.decision)}`,
    );
  }
  return lines.join("\n");
}

function onlyFile(directory: string, pattern: RegExp, label: string): string {
  const matches = existsSync(directory) ? readdirSync(directory).filter((name) => pattern.test(name)) : [];
  if (matches.length !== 1) {
    throw new NotifyError(
      `Expected exactly one Codex ${label} database in ${directory}; found ${matches.length} (${matches.join(", ") || "none"}).`,
      EXIT.refused,
    );
  }
  return path.join(directory, matches[0]!);
}

async function openReadOnly(file: string) {
  // node:sqlite is stable enough for read-only queries but still prints an
  // ExperimentalWarning, which would pollute agent-captured output.
  const listeners = process.listeners("warning");
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (warning.name !== "ExperimentalWarning") for (const listener of listeners) listener(warning);
  });
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(file, { readOnly: true });
}

function firstLine(file: string): string {
  const descriptor = openSync(file, "r");
  try {
    const chunk = Buffer.alloc(64 * 1024);
    const count = readSync(descriptor, chunk, 0, chunk.length, 0);
    const text = chunk.subarray(0, count).toString("utf8");
    const newline = text.indexOf("\n");
    return newline >= 0 ? text.slice(0, newline) : text;
  } finally {
    closeSync(descriptor);
  }
}

// Resolves the thread by exact UUID and requires the caller's expected Desktop
// name and project directory to match, so a stale or mistyped ID cannot reach
// a different conversation.
export async function resolveTarget(
  codexHome: string,
  threadId: string,
  expectedName: string,
  expectedCwd: string,
): Promise<ThreadTarget> {
  if (!THREAD_ID_PATTERN.test(threadId)) throw new NotifyError(`Invalid thread UUID: ${threadId}`, EXIT.usage);
  const cwd = existsSync(expectedCwd) ? realpathSync(expectedCwd) : expectedCwd;
  const database = await openReadOnly(onlyFile(codexHome, /^state_\d+\.sqlite$/, "state"));
  try {
    const row = database
      .prepare("SELECT id, name, cwd, archived, rollout_path FROM threads WHERE id = ?")
      .get(threadId) as { id: string; name: string | null; cwd: string; archived: number; rollout_path: string } | undefined;
    if (!row) throw new NotifyError(`Thread ${threadId} not found in Codex state.`, EXIT.refused);
    if (row.name !== expectedName) {
      throw new NotifyError(`Thread ${threadId} is named "${row.name ?? ""}", not "${expectedName}".`, EXIT.refused);
    }
    if (row.cwd !== cwd) throw new NotifyError(`Thread ${threadId} cwd is ${row.cwd}, not ${cwd}.`, EXIT.refused);
    if (row.archived !== 0) throw new NotifyError(`Thread ${threadId} is archived.`, EXIT.refused);
    const sameName = database
      .prepare("SELECT COUNT(*) AS count FROM threads WHERE name = ? AND archived = 0")
      .get(expectedName) as { count: number };
    if (sameName.count !== 1) {
      throw new NotifyError(`Ambiguous target: ${sameName.count} active threads are named "${expectedName}".`, EXIT.refused);
    }
    if (!existsSync(row.rollout_path)) {
      throw new NotifyError(`Rollout transcript missing for ${threadId}: ${row.rollout_path}`, EXIT.refused);
    }
    const meta = JSON.parse(firstLine(row.rollout_path)) as { type?: string; payload?: { id?: string; cwd?: string } };
    if (meta.type !== "session_meta" || meta.payload?.id !== threadId || meta.payload.cwd !== cwd) {
      throw new NotifyError(`Rollout ${row.rollout_path} does not belong to ${threadId} in ${cwd}.`, EXIT.refused);
    }
    return { threadId, name: row.name, cwd: row.cwd, rolloutPath: row.rollout_path };
  } finally {
    database.close();
  }
}

// Desktop owns its app-server over stdio; it never passes `--listen`. The
// matched executable is also the codex binary used to queue, so the CLI and
// the server that drains the queue come from the same installation.
export function findDesktopCodex(processList: string, codexBin?: string): string {
  const candidates = processList
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((tokens) => {
      const binIndex = tokens.findIndex((token) =>
        codexBin ? token === codexBin : token.endsWith(".app/Contents/Resources/codex"),
      );
      return binIndex >= 0 && tokens.slice(binIndex + 1).includes("app-server") && !tokens.includes("--listen");
    })
    .map((tokens) => codexBin ?? tokens.find((token) => token.endsWith(".app/Contents/Resources/codex"))!);
  const unique = [...new Set(candidates)];
  if (unique.length !== 1) {
    throw new NotifyError(
      unique.length === 0
        ? "Codex Desktop app-server is not running; the queued message would not be delivered."
        : `Ambiguous Codex Desktop installations: ${unique.join(", ")}. Pass --codex-bin explicitly.`,
      EXIT.refused,
    );
  }
  return unique[0]!;
}

function readRange(file: string, start: number, end: number): string {
  const descriptor = openSync(file, "r");
  try {
    const bytes = Buffer.alloc(Math.max(0, end - start));
    readSync(descriptor, bytes, 0, bytes.length, start);
    return bytes.toString("utf8");
  } finally {
    closeSync(descriptor);
  }
}

function rows(text: string): Array<Record<string, any>> {
  const parsed: Array<Record<string, any>> = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // A partial first or last line in a byte window is expected.
    }
  }
  return parsed;
}

export function rootStateFrom(transcriptText: string): RootState | undefined {
  let state: RootState | undefined;
  for (const row of rows(transcriptText)) {
    if (row.type !== "event_msg") continue;
    const type = row.payload?.type;
    if (type === "task_started") state = "running";
    else if (type === "task_complete") state = "idle";
    else if (type === "turn_aborted") state = "interrupted";
  }
  return state;
}

export function readRootState(rolloutPath: string): RootState {
  const size = statSync(rolloutPath).size;
  const state = rootStateFrom(readRange(rolloutPath, Math.max(0, size - ROOT_STATE_TAIL_BYTES), size));
  if (!state) throw new NotifyError(`Cannot determine Root turn state from ${rolloutPath}.`, EXIT.refused);
  return state;
}

export function findReceipt(transcriptText: string, ref: string): Receipt | undefined {
  const parsed = rows(transcriptText);
  const message = parsed.find(
    (row) =>
      row.type === "event_msg" &&
      row.payload?.type === "item_completed" &&
      row.payload.item?.type === "UserMessage" &&
      JSON.stringify(row.payload.item.content ?? []).includes(ref),
  );
  if (!message) return undefined;
  const turnId: string = message.payload.turn_id;
  const turnStarted = parsed.some(
    (row) => row.type === "event_msg" && row.payload?.type === "task_started" && row.payload.turn_id === turnId,
  );
  return { turnId, turnStarted };
}

async function queuedPayloads(codexHome: string, threadId: string): Promise<Array<{ id: string; payload: string }>> {
  const database = await openReadOnly(onlyFile(codexHome, /^queue_\d+\.sqlite$/, "queue"));
  try {
    return (
      database
        .prepare("SELECT id, payload_json FROM queued_items WHERE thread_id = ? ORDER BY queue_order")
        .all(threadId) as Array<{ id: string; payload_json: string }>
    ).map((item) => ({ id: item.id, payload: item.payload_json }));
  } finally {
    database.close();
  }
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type Options = {
  codexHome: string;
  thread: string;
  expectName: string;
  expectCwd: string;
  codexBin: string | undefined;
  waitSeconds: number;
  sinceByte: number | undefined;
  ref: string | undefined;
};

async function preflight(options: Options) {
  const target = await resolveTarget(options.codexHome, options.thread, options.expectName, options.expectCwd);
  const processList = execFileSync("ps", ["-axww", "-o", "args="], { encoding: "utf8" });
  const codexBin = findDesktopCodex(processList, options.codexBin);
  const rootState = readRootState(target.rolloutPath);
  if (rootState === "interrupted") {
    throw new NotifyError(
      "Root's last turn was interrupted; Codex does not drain queued messages until the user continues. Not sending.",
      EXIT.refused,
    );
  }
  const pending = (await queuedPayloads(options.codexHome, target.threadId))
    .filter((item) => item.payload.includes(HEADER))
    .map((item) => item.id);
  if (pending.length > 0) {
    throw new NotifyError(
      `An earlier agent notification is still queued for Root (${pending.join(", ")}). Not adding another.`,
      EXIT.refused,
    );
  }
  return { target, codexBin, rootState };
}

async function awaitReceipt(
  target: ThreadTarget,
  codexHome: string,
  ref: string,
  sinceByte: number,
  waitSeconds: number,
): Promise<{ receipt: Receipt | undefined; stillQueued: boolean }> {
  const deadline = Date.now() + waitSeconds * 1_000;
  for (;;) {
    const size = statSync(target.rolloutPath).size;
    const receipt = findReceipt(readRange(target.rolloutPath, sinceByte, size), ref);
    if (receipt?.turnStarted) return { receipt, stillQueued: false };
    if (Date.now() >= deadline) {
      const stillQueued = (await queuedPayloads(codexHome, target.threadId)).some((item) => item.payload.includes(ref));
      return { receipt, stillQueued };
    }
    await sleep(2_000);
  }
}

function report(fields: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(fields, null, 2)}\n`);
}

async function verifyOutcome(
  target: ThreadTarget,
  options: Options,
  ref: string,
  sinceByte: number,
  base: Record<string, unknown>,
): Promise<number> {
  const { receipt, stillQueued } = await awaitReceipt(target, options.codexHome, ref, sinceByte, options.waitSeconds);
  if (receipt?.turnStarted) {
    report({ ...base, status: "delivered", turnId: receipt.turnId });
    return EXIT.delivered;
  }
  if (stillQueued) {
    report({
      ...base,
      status: "queued",
      note: "Queued in Codex Desktop but not yet started (Root is busy). Do not resend; run verify later.",
    });
    return EXIT.queued;
  }
  report({
    ...base,
    status: "uncertain",
    turnId: receipt?.turnId,
    note: "No transcript receipt and no queued item. Do not resend; inspect Root before any retry.",
  });
  return EXIT.uncertain;
}

async function send(options: Options, notification: Notification): Promise<number> {
  const { target, codexBin, rootState } = await preflight(options);
  const ref = `agent-${randomUUID()}`;
  const message = formatMessage(notification, ref);
  const sinceByte = statSync(target.rolloutPath).size;
  const base = { threadId: target.threadId, name: target.name, ref, sinceByte, rootStateAtSend: rootState };

  // Exactly one attempt. A failed or ambiguous command is never retried here.
  const result = spawnSync(codexBin, ["queue", "--thread", target.threadId, "--message", message], {
    encoding: "utf8",
    timeout: 60_000,
  });
  const queued = /^Queued message (\S+) for thread (\S+)\.$/m.exec(result.stdout ?? "");
  if (result.status !== 0 || !queued || queued[2] !== target.threadId) {
    // The command may have enqueued before failing; only the transcript or
    // queue can prove otherwise, so report uncertainty rather than retrying.
    return verifyOutcome(target, { ...options, waitSeconds: 0 }, ref, sinceByte, {
      ...base,
      queueCommand: { exitStatus: result.status, stdout: result.stdout?.trim(), stderr: result.stderr?.trim() },
    });
  }
  return verifyOutcome(target, options, ref, sinceByte, { ...base, queuedItemId: queued[1] });
}

async function verify(options: Options): Promise<number> {
  if (!options.ref) throw new NotifyError("verify requires --ref.", EXIT.usage);
  const target = await resolveTarget(options.codexHome, options.thread, options.expectName, options.expectCwd);
  return verifyOutcome(target, options, options.ref, options.sinceByte ?? 0, {
    threadId: target.threadId,
    name: target.name,
    ref: options.ref,
  });
}

const USAGE = `Usage:
  codex-desktop-notify.ts blocker --thread <uuid> --expect-name <desktop title> --expect-cwd <project dir>
      --from <lane> --blocker <text> --evidence <text> --decision <text> [--wait <seconds>] [--codex-bin <path>]
  codex-desktop-notify.ts test    --thread <uuid> --expect-name <title> --expect-cwd <dir> --from <lane> [--wait <s>]
  codex-desktop-notify.ts check   --thread <uuid> --expect-name <title> --expect-cwd <dir>   (preflight only; sends nothing)
  codex-desktop-notify.ts verify  --thread <uuid> --expect-name <title> --expect-cwd <dir> --ref <ref>
      [--since-byte <n>] [--wait <s>]

Exit: 0 delivered (check: ready), 1 failed, 2 usage, 3 refused before sending, 4 queued behind an active turn, 5 uncertain.
Never rerun blocker/test after exit 4 or 5; use verify with the printed ref.`;

function parseArguments(argv: string[]): { command: string; values: Map<string, string> } {
  const [command, ...rest] = argv;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index]!;
    const value = rest[index + 1];
    if (!flag.startsWith("--") || value === undefined) throw new NotifyError(USAGE, EXIT.usage);
    values.set(flag.slice(2), value);
  }
  return { command: command ?? "", values };
}

function nonNegativeInteger(label: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new NotifyError(`--${label} must be a non-negative integer.`, EXIT.usage);
  return parsed;
}

async function main(argv: string[]): Promise<number> {
  const { command, values } = parseArguments(argv);
  const options: Options = {
    codexHome: process.env.CODEX_HOME ?? path.join(homedir(), ".codex"),
    thread: requireField("thread", values.get("thread")),
    expectName: requireField("expect-name", values.get("expect-name")),
    expectCwd: requireField("expect-cwd", values.get("expect-cwd")),
    codexBin: values.get("codex-bin"),
    waitSeconds: nonNegativeInteger("wait", values.get("wait"), 90),
    sinceByte: values.has("since-byte") ? nonNegativeInteger("since-byte", values.get("since-byte"), 0) : undefined,
    ref: values.get("ref"),
  };
  const from = values.get("from") ?? "";
  switch (command) {
    case "test":
      return send(options, { kind: "test", from });
    case "blocker":
      return send(options, {
        kind: "blocker",
        from,
        blocker: values.get("blocker") ?? "",
        evidence: values.get("evidence") ?? "",
        decision: values.get("decision") ?? "",
      });
    case "check": {
      const { target, codexBin, rootState } = await preflight(options);
      report({ status: "ready", threadId: target.threadId, name: target.name, cwd: target.cwd, rootState, codexBin });
      return EXIT.delivered;
    }
    case "verify":
      return verify(options);
    default:
      throw new NotifyError(USAGE, EXIT.usage);
  }
}

const entrypoint = process.argv[1];
if (entrypoint && realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof NotifyError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.exitCode;
  }
}
