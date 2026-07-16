import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");

test("ChatGPT review converges in one chat before a fresh independent confirmation", () => {
  assert.match(skill, /Wait at least two minutes before the first result poll/);
  assert.match(skill, /Elapsed time alone never makes a ChatGPT review stalled or incomplete/);
  assert.match(skill, /There is no elapsed-time timeout or unchanged-progress limit/);
  assert.match(skill, /Do not click `Stop answering`/);
  assert.match(skill, /15-minute guidance refresh reloads the skill around the active run/);
  assert.match(skill, /recovery attempts against the same UUID-backed surface and conversation/);
  assert.match(skill, /REQUEST_ID=github:<owner>\/<repository>:pr:<number>:head:<full-sha>:/);
  assert.match(skill, /Review @GitHub <owner>\/<repository> PR #<number>\./);
  assert.match(skill, /COUNT_ONLY/);
  assert.match(skill, /AFTER_ASSISTANT_COUNT="\$BASELINE"/);
  assert.match(skill, /matching both the retained submission head and a fresh GitHub head read/);
  assert.match(skill, /Updated\. Re-review everything\./);
  assert.match(skill, /use ChatGPT's `Shift\+Command\+O` new-chat shortcut/);
  assert.match(skill, /do not start a fresh chat while that working chat still reports findings/);
  assert.match(skill, /two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations/);
});
