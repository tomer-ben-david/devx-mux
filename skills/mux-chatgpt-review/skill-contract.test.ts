import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");

test("ChatGPT review converges in one chat before a fresh independent confirmation", () => {
  assert.match(skill, /background wait for about five minutes without reading or interacting with the browser/);
  assert.match(skill, /run another five-minute background wait and inspect again/);
  assert.match(skill, /no Mux waiter, request token, turn token, response digest, or ChatGPT DOM parser/);
  assert.match(skill, /A sleep only delays the next inspection/);
  assert.match(skill, /agent owns the one browser read after each wait/);
  assert.match(skill, /Never use `\/new`, navigation, reload, branching, or retry as recovery/);
  assert.match(skill, /through non-mutating inspection methods/);
  assert.match(skill, /report the blocker and do not classify the run as complete/);
  assert.doesNotMatch(skill, /recover or reload/);
  assert.match(skill, /Elapsed time alone never makes a ChatGPT review stalled or incomplete/);
  assert.match(skill, /Do not click `Stop answering`/);
  assert.match(skill, /15-minute guidance refresh reloads instructions around the active run/);
  assert.match(skill, /recovery attempts against the same UUID-backed surface and conversation/);
  assert.match(skill, /Review @GitHub <owner>\/<repository> PR #<number>\./);
  assert.doesNotMatch(skill, /\nREQUEST_ID=github:<owner>\/<repository>:pr:<number>:head:<full-sha>:/);
  assert.match(skill, /matching both the retained submission head and a fresh GitHub head read/);
  assert.match(skill, /Updated\. Re-review everything\./);
  assert.match(skill, /visible `New chat` control through a fresh cmux accessibility snapshot/);
  assert.match(skill, /Never encode a keyboard shortcut for this action/);
  assert.match(skill, /ask the user once to create the fresh chat on the same surface/);
  assert.doesNotMatch(skill, /Shift\+Command\+O/);
  assert.match(skill, /do not start a fresh chat while that working chat still reports findings/);
  assert.match(skill, /Do not converge through whack-a-mole patches/);
  assert.match(skill, /in-scope long-term structural improvement/);
  assert.match(skill, /those remain scope creep/);
  assert.match(skill, /two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations/);
});
