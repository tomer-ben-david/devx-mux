import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXIT,
  HEADER,
  findDesktopCodex,
  findReceipt,
  formatMessage,
  resolveTarget,
  rootStateFrom,
} from "./codex-desktop-notify.ts";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "codex-desktop-notify.ts");
const THREAD = "00000000-0000-4000-8000-000000000001";
const NAME = "Example Root task";

const event = (payload: Record<string, unknown>) => JSON.stringify({ type: "event_msg", payload });
const started = (turnId: string) => event({ type: "task_started", turn_id: turnId });
const completed = (turnId: string) => event({ type: "task_complete", turn_id: turnId });
const userMessage = (turnId: string, text: string) =>
  event({ type: "item_completed", turn_id: turnId, item: { type: "UserMessage", content: [{ type: "text", text }] } });

type Fixture = { root: string; codexHome: string; cwd: string; rollout: string };

function fixture(options: { lastEvent?: string; threads?: Array<{ id: string; name: string; archived?: number }> } = {}): Fixture {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "mux-root-notify-")));
  const codexHome = path.join(root, "codex");
  const cwd = path.join(root, "example-project");
  const rollout = path.join(codexHome, "sessions", `rollout-${THREAD}.jsonl`);
  mkdirSync(path.dirname(rollout), { recursive: true });
  mkdirSync(cwd);
  writeFileSync(
    rollout,
    [
      JSON.stringify({ type: "session_meta", payload: { id: THREAD, cwd } }),
      started("turn-0"),
      options.lastEvent ?? completed("turn-0"),
      "",
    ].join("\n"),
  );

  const state = new DatabaseSync(path.join(codexHome, "state_5.sqlite"));
  state.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, cwd TEXT, archived INTEGER, rollout_path TEXT)");
  const insert = state.prepare("INSERT INTO threads VALUES (?, ?, ?, ?, ?)");
  for (const thread of options.threads ?? [{ id: THREAD, name: NAME }]) {
    insert.run(thread.id, thread.name, cwd, thread.archived ?? 0, rollout);
  }
  state.close();

  const queue = new DatabaseSync(path.join(codexHome, "queue_1.sqlite"));
  queue.exec(
    "CREATE TABLE queued_items (id TEXT PRIMARY KEY, thread_id TEXT, payload_json TEXT, queue_order INTEGER, created_at_ms INTEGER, updated_at_ms INTEGER)",
  );
  queue.close();
  return { root, codexHome, cwd, rollout };
}

// Stands in for both the Desktop-owned `codex app-server` process and the
// `codex queue` CLI. FAKE_MODE selects what the Desktop does with the message.
function fakeCodex(root: string): string {
  const bin = path.join(root, "fake-codex");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require("node:fs");
const [command, , thread, , message] = process.argv.slice(2);
if (command === "app-server") { setInterval(() => {}, 1000); return; }
fs.appendFileSync(process.env.FAKE_CALLS, "queue\\n");
const mode = process.env.FAKE_MODE;
if (mode === "fail") { process.stderr.write("failed to queue session message\\n"); process.exit(1); }
if (mode === "deliver") {
  const event = (payload) => JSON.stringify({ type: "event_msg", payload });
  fs.appendFileSync(process.env.FAKE_ROLLOUT, [
    event({ type: "task_started", turn_id: "turn-queued" }),
    event({ type: "item_completed", turn_id: "turn-queued", item: { type: "UserMessage", content: [{ type: "text", text: message }] } }),
    "",
  ].join("\\n"));
}
if (mode === "queue") {
  const { DatabaseSync } = require("node:sqlite");
  const queue = new DatabaseSync(process.env.FAKE_QUEUE);
  queue.prepare("INSERT INTO queued_items VALUES ('q1', ?, ?, 0, 0, 0)").run(thread, JSON.stringify({ content: message }));
  queue.close();
}
process.stdout.write("Queued message q1 for thread " + thread + ".\\n");
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

const desktops: ChildProcess[] = [];
after(() => desktops.forEach((desktop) => desktop.kill()));

async function runNotify(
  setup: Fixture,
  mode: string,
  command: string[],
): Promise<{ status: number | null; stdout: string; stderr: string; calls: number }> {
  const bin = fakeCodex(setup.root);
  const desktop = spawn(bin, ["app-server"], { stdio: "ignore" });
  desktops.push(desktop);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const calls = path.join(setup.root, "calls.log");
  const result = spawnSync(
    process.execPath,
    [script, ...command, "--thread", THREAD, "--expect-name", NAME, "--expect-cwd", setup.cwd, "--codex-bin", bin, "--wait", "0"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_HOME: setup.codexHome,
        FAKE_MODE: mode,
        FAKE_CALLS: calls,
        FAKE_ROLLOUT: setup.rollout,
        FAKE_QUEUE: path.join(setup.codexHome, "queue_1.sqlite"),
      },
    },
  );
  desktop.kill();
  const callCount = existsSync(calls) ? readFileSync(calls, "utf8").trim().split("\n").length : 0;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: callCount };
}

const blocker = ["blocker", "--from", "Claude lane-a", "--blocker", "b", "--evidence", "e", "--decision", "d"];

test("labels every notification as an agent message with sender and reference", () => {
  const message = formatMessage(
    { kind: "blocker", from: "Claude lane-a", blocker: "Fixture missing", evidence: "test.log:12", decision: "Skip or regenerate?" },
    "agent-ref-1",
  );
  assert.equal(
    message,
    [
      "[Agent notification -> Root] from: Claude lane-a · ref: agent-ref-1",
      "Sent by an AI agent, not the user. It is not user authorization.",
      "Blocker: Fixture missing",
      "Evidence: test.log:12",
      "Decision requested: Skip or regenerate?",
    ].join("\n"),
  );
  assert.match(formatMessage({ kind: "test", from: "Claude" }, "r"), /transport test, not a product instruction/);
  assert.throws(() => formatMessage({ kind: "blocker", from: "C", blocker: "", evidence: "e", decision: "d" }, "r"), /--blocker/);
  assert.throws(
    () => formatMessage({ kind: "blocker", from: "C", blocker: "x".repeat(801), evidence: "e", decision: "d" }, "r"),
    /concise/,
  );
});

test("targets only the exact, unique, unarchived thread in the expected project", async () => {
  const setup = fixture();
  assert.equal((await resolveTarget(setup.codexHome, THREAD, NAME, setup.cwd)).rolloutPath, setup.rollout);
  await assert.rejects(resolveTarget(setup.codexHome, THREAD, "Example Root", setup.cwd), /is named/);
  await assert.rejects(resolveTarget(setup.codexHome, THREAD, NAME, setup.root), /cwd is/);
  await assert.rejects(resolveTarget(setup.codexHome, "not-a-uuid", NAME, setup.cwd), /Invalid thread UUID/);

  const duplicate = fixture({
    threads: [
      { id: THREAD, name: NAME },
      { id: "00000000-0000-4000-8000-000000000002", name: NAME },
    ],
  });
  await assert.rejects(resolveTarget(duplicate.codexHome, THREAD, NAME, duplicate.cwd), /Ambiguous target: 2/);

  const archived = fixture({ threads: [{ id: THREAD, name: NAME, archived: 1 }] });
  await assert.rejects(resolveTarget(archived.codexHome, THREAD, NAME, archived.cwd), /archived/);
});

test("uses only the Desktop-owned stdio app-server, never a listening server", () => {
  const desktop = "/Applications/ChatGPT.app/Contents/Resources/codex -c x=1 app-server --analytics-default-enabled";
  assert.equal(findDesktopCodex(`zsh\n${desktop}\n`), "/Applications/ChatGPT.app/Contents/Resources/codex");
  assert.throws(
    () => findDesktopCodex("/Applications/ChatGPT.app/Contents/Resources/codex app-server --listen unix://\n"),
    /not running/,
  );
  assert.throws(() => findDesktopCodex("/opt/homebrew/bin/codex queue --thread x\n"), /not running/);
  assert.throws(
    () => findDesktopCodex(`${desktop}\n/Applications/Codex.app/Contents/Resources/codex app-server\n`),
    /Ambiguous/,
  );
});

test("reads Root turn state from the latest lifecycle event", () => {
  assert.equal(rootStateFrom([started("a"), completed("a"), started("b")].join("\n")), "running");
  assert.equal(rootStateFrom([started("a"), completed("a")].join("\n")), "idle");
  assert.equal(rootStateFrom([started("a"), event({ type: "turn_aborted", turn_id: "a" })].join("\n")), "interrupted");
  assert.equal(rootStateFrom('{"partial line'), undefined);
});

test("requires the reference in a user message and the turn it started", () => {
  const text = [started("t1"), userMessage("t1", "hello ref-9")].join("\n");
  assert.deepEqual(findReceipt(text, "ref-9"), { turnId: "t1", turnStarted: true });
  assert.deepEqual(findReceipt(userMessage("t2", "ref-9"), "ref-9"), { turnId: "t2", turnStarted: false });
  assert.equal(findReceipt(text, "ref-other"), undefined);
});

test("reports delivery only after the transcript shows the message and its turn", async () => {
  const setup = fixture();
  const result = await runNotify(setup, "deliver", blocker);
  assert.equal(result.status, EXIT.delivered, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "delivered");
  assert.equal(report.turnId, "turn-queued");
  assert.equal(report.rootStateAtSend, "idle");
  assert.equal(result.calls, 1);
});

test("reports a message queued behind an active turn without claiming delivery", async () => {
  const setup = fixture({ lastEvent: started("turn-active") });
  const result = await runNotify(setup, "queue", ["test", "--from", "Grok Bot"]);
  assert.equal(result.status, EXIT.queued, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "queued");
  assert.equal(report.rootStateAtSend, "running");
});

test("never resends after an uncertain queue failure", async () => {
  const setup = fixture();
  const result = await runNotify(setup, "fail", blocker);
  assert.equal(result.status, EXIT.uncertain);
  assert.equal(JSON.parse(result.stdout).status, "uncertain");
  assert.equal(result.calls, 1);
});

test("refuses before sending when Root was interrupted or a notification is pending", async () => {
  const interrupted = fixture({ lastEvent: event({ type: "turn_aborted", turn_id: "turn-0" }) });
  const stopped = await runNotify(interrupted, "deliver", blocker);
  assert.equal(stopped.status, EXIT.refused);
  assert.match(stopped.stderr, /interrupted/);
  assert.equal(stopped.calls, 0);

  const pending = fixture();
  const queue = new DatabaseSync(path.join(pending.codexHome, "queue_1.sqlite"));
  queue.prepare("INSERT INTO queued_items VALUES ('q0', ?, ?, 0, 0, 0)").run(THREAD, JSON.stringify({ text: `${HEADER} x` }));
  queue.close();
  const duplicate = await runNotify(pending, "deliver", blocker);
  assert.equal(duplicate.status, EXIT.refused);
  assert.match(duplicate.stderr, /still queued/);
  assert.equal(duplicate.calls, 0);
});

test("refuses before sending when the Desktop app-server is not running", () => {
  const setup = fixture();
  const result = spawnSync(
    process.execPath,
    [script, ...blocker, "--thread", THREAD, "--expect-name", NAME, "--expect-cwd", setup.cwd, "--codex-bin", path.join(setup.root, "absent")],
    { encoding: "utf8", env: { ...process.env, CODEX_HOME: setup.codexHome } },
  );
  assert.equal(result.status, EXIT.refused);
  assert.match(result.stderr, /not running/);
});
