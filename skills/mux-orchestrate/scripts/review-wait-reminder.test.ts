import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDirectory, "review-wait-reminder.sh");

test("the review wait reminder only delays and hands inspection back to the agent", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /cmux|rex|browser|eval|javascript|html/i);

  const output = execFileSync("bash", [script, "surface:42", "0"], { encoding: "utf8" });
  assert.match(output, /Review exists on surface:42 and is ready for the agent to check now/);
  assert.match(output, /Completion is unknown; this script did not inspect it/);
});
