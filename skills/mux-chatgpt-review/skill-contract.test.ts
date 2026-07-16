import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");

test("ChatGPT review converges in one chat before a fresh independent confirmation", () => {
  assert.match(skill, /Run `chatgpt-review-wait\.mjs` once in a background terminal/);
  assert.match(skill, /checks request-bound structured state internally once per minute/);
  assert.match(skill, /same response on three consecutive polls/);
  assert.match(skill, /shared waiter owns only transport completion/);
  assert.match(skill, /response-local completed UI control/);
  assert.match(skill, /focused workflow must accept it only when it contains both/);
  assert.match(skill, /emits at most one waiting status every five minutes/);
  assert.match(skill, /must not add its own sleep loop, browser polling, or body-text scraping/);
  assert.match(skill, /Elapsed time alone never makes a ChatGPT review stalled or incomplete/);
  assert.match(skill, /There is no elapsed-time timeout or unchanged-progress limit/);
  assert.match(skill, /Do not click `Stop answering`/);
  assert.match(skill, /15-minute guidance refresh reloads the skill around the active run/);
  assert.match(skill, /recovery attempts against the same UUID-backed surface and conversation/);
  assert.match(skill, /REQUEST_ID=github:<owner>\/<repository>:pr:<number>:head:<full-sha>:/);
  assert.match(skill, /Review @GitHub <owner>\/<repository> PR #<number>\./);
  assert.match(skill, /chatgpt-review-wait\.mjs" cmux surface:N REQUEST_ID=<id>/);
  assert.match(skill, /must not use a raw assistant-node count/);
  assert.match(skill, /visible or accessible `Stop answering` label/);
  assert.match(skill, /matching both the retained submission head and a fresh GitHub head read/);
  assert.match(skill, /Updated\. Re-review everything\./);
  assert.match(skill, /use ChatGPT's `Shift\+Command\+O` new-chat shortcut/);
  assert.match(skill, /do not start a fresh chat while that working chat still reports findings/);
  assert.match(skill, /Do not converge through whack-a-mole patches/);
  assert.match(skill, /in-scope long-term structural improvement/);
  assert.match(skill, /those remain scope creep/);
  assert.match(skill, /two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations/);
});
