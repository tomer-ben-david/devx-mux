import assert from "node:assert/strict";
import test from "node:test";
import { grokReviewArguments } from "./grok-provider.js";

test("enables Grok verification without disabling its required subagents", () => {
  const arguments_ = grokReviewArguments("review prompt", "/work/repository");

  assert.ok(arguments_.includes("--check"));
  assert.ok(!arguments_.includes("--no-subagents"));
});

test("passes the repository and prompt as distinct arguments", () => {
  const arguments_ = grokReviewArguments("review prompt", "/work/repository");

  assert.deepEqual(arguments_.slice(0, 4), [
    "--cwd",
    "/work/repository",
    "--single",
    "review prompt",
  ]);
});
