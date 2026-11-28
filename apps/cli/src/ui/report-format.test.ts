import assert from "node:assert/strict";
import test from "node:test";
import { toRepoRelativePaths } from "./report-format.js";

test("shortens absolute paths under the run's repository to repository-relative paths", () => {
  assert.equal(
    toRepoRelativePaths(
      "[Test double](/Users/tomerbd/dev/projects/devx-mux-ui/apps/cli/src/board/board-command.test.ts:35)",
      "devx-mux-ui",
    ),
    "[Test double](apps/cli/src/board/board-command.test.ts:35)",
  );
  assert.equal(
    toRepoRelativePaths("[Report](/Users/tomerbd/dev/projects/devx-mux/apps/cli/src/x.ts:35)", "devx-mux"),
    "[Report](apps/cli/src/x.ts:35)",
  );
});

test("shortens every occurrence in the same text", () => {
  assert.equal(
    toRepoRelativePaths(
      "/Users/tomerbd/dev/projects/devx-mux-ui/apps/cli/src/a.ts:1 · /Users/tomerbd/dev/projects/devx-mux-ui/apps/cli/src/b.ts:2",
      "devx-mux-ui",
    ),
    "apps/cli/src/a.ts:1 · apps/cli/src/b.ts:2",
  );
});

test("leaves paths outside the reviewed repository unchanged", () => {
  const standardsLink = "[DevX standards](/Users/tomerbd/dev/projects/devx-coding-standards/general-conventions.md)";
  assert.equal(toRepoRelativePaths(standardsLink, "devx-mux-ui"), standardsLink);
});

test("does not shorten a similarly named repository path", () => {
  const text = "/Users/tomerbd/dev/projects/devx-mux-ui/apps/cli/src/a.ts:1";
  assert.equal(toRepoRelativePaths(text, "devx-mux"), text);
});

test("leaves web URLs unchanged", () => {
  const url = "https://github.com/tomer-ben-david/devx-mux-ui/blob/abc/apps/cli/src/x.ts:35";
  assert.equal(toRepoRelativePaths(url, "devx-mux-ui"), url);
});
