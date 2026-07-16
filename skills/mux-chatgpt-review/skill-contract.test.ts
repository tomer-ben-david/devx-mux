import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");

test("ChatGPT review waits for an exact-head final verdict without biasing rereviews", () => {
  assert.match(skill, /Wait at least two minutes before the first result poll/);
  assert.match(skill, /newest completed assistant message contains all of/);
  assert.match(skill, /the current request ID/);
  assert.match(skill, /the exact full head SHA/);
  assert.match(skill, /Do not describe the prior finding or the fix in the rereview prompt/);
  assert.match(skill, /Finish only when ChatGPT reports `ALL CLEAN` for the current GitHub head/);
});
