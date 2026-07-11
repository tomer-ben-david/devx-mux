import assert from "node:assert/strict";
import test from "node:test";
import { instructionPathsFromGitFiles, summarizePorcelainStatus } from "./git.js";

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

test("discovers root and nested repository instructions", () => {
  assert.deepEqual(
    instructionPathsFromGitFiles("/repo", "src/AGENTS.md\nREADME.md\nCLAUDE.md\npackages/api/claude.md\n"),
    ["/repo/CLAUDE.md", "/repo/packages/api/claude.md", "/repo/src/AGENTS.md"],
  );
});

test("reports an empty working tree", () => {
  assert.deepEqual(summarizePorcelainStatus(""), {
    files: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
  });
});
