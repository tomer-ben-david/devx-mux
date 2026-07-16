import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDirectory, "review-wait-reminder.ts");

test("the portable review reminder returns stable identity without inspecting the result", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /cmux|rex|browser|eval|javascript|html/i);

  const identity = "surface_id=4C1F78AF-41D0-440F-AAD1-5E471D818DB7";
  const output = execFileSync(process.execPath, [script, identity, "0"], { encoding: "utf8" });
  assert.match(output, new RegExp(`Review exists on ${identity}`));
  assert.match(output, /ready for the agent to check now/);
  assert.match(output, /Completion is unknown; this script did not inspect it/);
});
