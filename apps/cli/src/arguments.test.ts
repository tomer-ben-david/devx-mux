import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewArguments } from "./arguments.js";

test("defaults to branch review against origin/main", () => {
  const result = parseReviewArguments([]);

  assert.deepEqual(result.scope, { kind: "branch", base: "origin/main" });
  assert.equal(result.dryRun, false);
});

test("parses a selected commit and dry-run", () => {
  const result = parseReviewArguments(["commit", "HEAD~2", "--dry-run"]);

  assert.deepEqual(result.scope, { kind: "commit", ref: "HEAD~2" });
  assert.equal(result.dryRun, true);
});

test("rejects a reference for local review", () => {
  assert.throws(
    () => parseReviewArguments(["local", "HEAD"]),
    /Local scope does not accept a reference/,
  );
});

