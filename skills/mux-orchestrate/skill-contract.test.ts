import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const skill = readFileSync(new URL("./SKILL.md", import.meta.url), "utf8");

test("the live checkpoint preserves every open repair family across context loss", () => {
  assert.match(skill, /Maintain one repair-family ledger for the current goal/);
  assert.match(skill, /Keep every unrelated open family in the ledger at the same time/);
  assert.match(skill, /reconstruct every open repair family, closed-family tombstone, and attempt history/);
  assert.match(skill, /mark it unknown, do not reset it to zero/);
  assert.match(skill, /Open repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.match(skill, /compact tombstone that retains its stable identity, attempt count, closure head and evidence/);
  assert.match(skill, /Closed repair families:\n- id=<stable family identity>; attempts=<count or unknown>/);
  assert.doesNotMatch(skill, /^Repair family:/m);
  assert.doesNotMatch(skill, /^Repair attempts:/m);
});
