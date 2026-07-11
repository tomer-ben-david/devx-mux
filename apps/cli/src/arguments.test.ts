import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewArguments } from "./arguments.js";

test("defaults to branch review against origin/main", () => {
  const result = parseReviewArguments(["--provider", "grok"]);

  assert.deepEqual(result.scope, { kind: "branch", base: "origin/main" });
  assert.equal(result.provider, "grok");
  assert.equal(result.dryRun, false);
});

test("parses a selected commit and dry-run", () => {
  const result = parseReviewArguments(["commit", "HEAD~2", "--provider", "grok", "--dry-run"]);

  assert.deepEqual(result.scope, { kind: "commit", ref: "HEAD~2" });
  assert.equal(result.dryRun, true);
});

test("rejects a reference for local review", () => {
  assert.throws(
    () => parseReviewArguments(["local", "HEAD", "--provider", "grok"]),
    /Local scope does not accept a reference/,
  );
});

test("requires an explicit provider", () => {
  assert.throws(
    () => parseReviewArguments(["branch"]),
    /Missing required option: --provider/,
  );
});

test("rejects an unsupported provider", () => {
  assert.throws(
    () => parseReviewArguments(["branch", "--provider", "claude"]),
    /Unsupported provider: claude/,
  );
});

test("parses a full codebase audit", () => {
  const result = parseReviewArguments(["codebase", "--provider", "codex", "--reasoning", "xhigh"]);

  assert.deepEqual(result.scope, { kind: "codebase" });
  assert.equal(result.provider, "codex");
  assert.equal(result.reasoningEffort, "xhigh");
});

test("parses a pull request with its comparison base", () => {
  const result = parseReviewArguments(["pr", "42", "--provider", "codex", "--base", "origin/develop"]);
  assert.deepEqual(result.scope, { kind: "pr", number: 42, base: "origin/develop" });
});

test("rejects xhigh reasoning for Grok", () => {
  assert.throws(
    () => parseReviewArguments(["codebase", "--provider", "grok", "--reasoning", "xhigh"]),
    /Grok does not support xhigh/,
  );
});
