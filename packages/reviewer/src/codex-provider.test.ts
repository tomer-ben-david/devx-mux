import assert from "node:assert/strict";
import test from "node:test";
import { codexReviewArguments } from "./codex-provider.js";

test("runs Codex ephemerally in the read-only sandbox", () => {
  const arguments_ = codexReviewArguments("review prompt", "/work/repository");

  assert.deepEqual(arguments_, [
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    "/work/repository",
    "review prompt",
  ]);
});

