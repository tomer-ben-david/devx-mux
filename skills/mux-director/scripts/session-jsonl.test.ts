import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "session-jsonl.ts");

function run(args: string[], environment: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
}

// Like run but tolerates non-zero exits so timeout ("incomplete") can be asserted.
function runResult(args: string[], environment: NodeJS.ProcessEnv = {}): { stdout: string; status: number | null } {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  return { stdout: result.stdout, status: result.status };
}

const codexAssistant = (text: string) =>
  JSON.stringify({
    type: "response_item",
    payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
  });

test("resolves a Codex transcript by arbitrary checkout path and session ID", () => {
  const root = mkdtempSync(path.join(tmpdir(), "mux-session-path-"));
  const repository = path.join(root, "someone", "renamed-checkout");
  const codexHome = path.join(root, "state", "codex");
  const transcript = path.join(codexHome, "sessions", "2026", "07", "13", "review.jsonl");
  mkdirSync(repository, { recursive: true });
  mkdirSync(path.dirname(transcript), { recursive: true });
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: realpathSync(repository), id: "session-1" } })}\n`,
  );

  assert.equal(run(["path", "codex", repository, "session-1"], { CODEX_HOME: codexHome }).trim(), transcript);
});

test("seeded byte cursor emits only appended assistant messages", () => {
  const root = mkdtempSync(path.join(tmpdir(), "mux-session-cursor-"));
  const transcript = path.join(root, "review.jsonl");
  const cursor = path.join(root, "state", "review.cursor");
  const assistant = (text: string) =>
    JSON.stringify({
      type: "response_item",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    });
  writeFileSync(transcript, `${assistant("historical")}\n`);

  run(["seed", transcript, cursor]);
  appendFileSync(transcript, `${assistant("new finding")}\n`);

  assert.equal(run(["read", "codex", transcript, cursor]).trim(), "new finding");
  assert.equal(run(["read", "codex", transcript, cursor]), "");
  assert.equal(Number(readFileSync(cursor, "utf8")), Buffer.byteLength(readFileSync(transcript)));
});

// Shared harness for `wait`: a Codex session under a fake CODEX_HOME whose
// session_meta cwd matches the repository, with the cursor seeded past it so
// wait only observes appended content.
function setupCodexWaitSession(): { repository: string; transcript: string; cursor: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(path.join(tmpdir(), "mux-session-wait-"));
  const repository = path.join(root, "checkout");
  const codexHome = path.join(root, "codex");
  const transcript = path.join(codexHome, "sessions", "2026", "07", "28", "impl.jsonl");
  const cursor = path.join(root, "wait.cursor");
  mkdirSync(repository, { recursive: true });
  mkdirSync(path.dirname(transcript), { recursive: true });
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: realpathSync(repository), id: "wait-1" } })}\n`,
  );
  run(["seed", transcript, cursor]);
  return { repository, transcript, cursor, env: { CODEX_HOME: codexHome } };
}

test("wait exits 0 and prints the final message once the transcript goes idle", () => {
  const { repository, transcript, cursor, env } = setupCodexWaitSession();
  // Append a final assistant message, then leave the file idle. With a short
  // interval the quiescence check sees no further growth and resolves done.
  appendFileSync(transcript, `${codexAssistant("implementation complete")}\n`);
  const result = runResult(["wait", "codex", repository, "wait-1", "--cursor", cursor, "--max", "5", "--interval", "1"], env);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "implementation complete");
});

test("wait exits non-zero (incomplete) when no final message arrives within max", () => {
  const { repository, cursor, env } = setupCodexWaitSession();
  // No append: the transcript never produces a final message. This also proves
  // --max self-terminates the process (it would otherwise hang indefinitely).
  // macOS has no `timeout(1)`, so --max is the only bound; assert it is honored.
  const start = Date.now();
  const result = runResult(["wait", "codex", repository, "wait-1", "--cursor", cursor, "--max", "2", "--interval", "1"], env);
  const elapsed = (Date.now() - start) / 1000;

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /^$/);
  // Terminated by --max (2s) plus at most one trailing interval - never hangs.
  assert.ok(elapsed < 5, `wait should self-terminate near --max, took ${elapsed}s`);
});

test("wait does not fire on a still-growing transcript (no false completion mid-stream)", async () => {
  const { repository, transcript, cursor, env } = setupCodexWaitSession();
  // Append a first final message, then keep appending from an async detached
  // background process so the file keeps growing WHILE the wait child runs.
  // (A parent setInterval can't: spawnSync blocks the parent until the child
  // exits, so no growth would be observed.) wait must never see a quiescent
  // interval and must stay incomplete.
  appendFileSync(transcript, `${codexAssistant("partial one")}\n`);
  const growScript = path.join(mkdtempSync(path.join(tmpdir(), "mux-grow-")), "grow.mjs");
  writeFileSync(
    growScript,
    `import { appendFileSync } from "node:fs";\n` +
      `const line = ${JSON.stringify(`${codexAssistant("more")}\\n`)};\n` +
      `for (let i = 0; i < 30; i += 1) { appendFileSync(${JSON.stringify(transcript)}, line); await new Promise(r => setTimeout(r, 150)); }\n`,
  );
  const grow = spawn(process.execPath, [growScript], { stdio: "ignore", detached: true });
  grow.unref();
  await new Promise((resolve) => setTimeout(resolve, 250)); // let the grower start writing
  const result = runResult(
    ["wait", "codex", repository, "wait-1", "--cursor", cursor, "--max", "2", "--interval", "1"],
    env,
  );
  assert.notEqual(result.status, 0);
  grow.kill();
});


test("wait preserves consumed messages when the deadline prevents completion", () => {
  const { repository, transcript, cursor, env } = setupCodexWaitSession();
  appendFileSync(transcript, `${codexAssistant("partial evidence")}\n`);
  const result = runResult(
    ["wait", "codex", repository, "wait-1", "--cursor", cursor, "--max", "1", "--interval", "1"], env,
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), "partial evidence");
  assert.equal(run(["read", "codex", transcript, cursor], env), "");
});
