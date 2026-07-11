import assert from "node:assert/strict";
import test from "node:test";
import { summarizePorcelainStatus } from "./git.js";

test("preserves porcelain status columns for modified and staged files", () => {
  const summary = summarizePorcelainStatus([
    " M modified.ts",
    "M  staged.ts",
    "MM both.ts",
    "?? new.ts",
    "",
  ].join("\n"));

  assert.deepEqual(summary, {
    files: 4,
    staged: 2,
    modified: 2,
    untracked: 1,
  });
});

test("reports an empty working tree", () => {
  assert.deepEqual(summarizePorcelainStatus(""), {
    files: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
  });
});
