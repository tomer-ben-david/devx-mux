import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
