import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");
const reviewProtocol = readFileSync(new URL("./references/review-protocol.md", import.meta.url), "utf8");

test("the live checkpoint preserves every open repair family across context loss", () => {
  assert.match(skill, /Maintain one repair-family ledger for the current goal/);
  assert.match(skill, /Keep every unrelated open family in the ledger at the same time/);
  assert.match(skill, /reconstructing every open repair family, closed-family tombstone, and attempt history/);
  assert.match(skill, /mark the affected state unknown, do not reset it to zero/);
  assert.match(skill, /Open repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.match(skill, /compact tombstone that retains its stable identity, attempt count, closure head and evidence/);
  assert.match(skill, /Closed repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.match(skill, /Assign the scope contract one stable goal ID/);
  assert.match(skill, /Required outcome: the concrete state that must be true before the goal can close/);
  assert.match(skill, /Acceptance evidence: the observations, checks, or artifacts that prove the required outcome/);
  assert.match(skill, /Scope contract: goal=<intent>; non-goals=<boundaries>; review=<scope>; mutation=<authority>; required=<outcome>; acceptance=<evidence>/);
  assert.match(skill, /Reconcile ledger state only when its bound goal ID and snapshot match/);
  assert.doesNotMatch(skill, /^Repair family:/m);
  assert.doesNotMatch(skill, /^Repair attempts:/m);
});

test("the shared protocol preserves ChatGPT working-chat continuity", () => {
  assert.match(reviewProtocol, /owns one explicit persistent-conversation exception/);
  assert.match(reviewProtocol, /Updated\. Re-review everything\./);
  assert.match(reviewProtocol, /Freshness applies when that workflow starts its independent clean-confirmation conversation/);
  assert.match(reviewProtocol, /provenance and exact-head gates still apply to every result/);
});
