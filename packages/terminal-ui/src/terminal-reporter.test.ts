import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { TerminalReporter } from "./terminal-reporter.js";

test("renders stable review progress without color", () => {
  const output = new PassThrough();
  let rendered = "";
  output.on("data", (chunk) => { rendered += chunk.toString(); });
  const reporter = new TerminalReporter({ output, color: false, animated: false, startedAt: 1_000 });

  reporter.heading("Review", "Local changes · Grok");
  reporter.success("Repository", "example");
  reporter.active("Reviewer", "Grok · high reasoning");
  reporter.providerChunk("Inspecting diff\nFound one issue");
  reporter.flushProvider();
  reporter.document("## Standards checklist\n| Item | Status | Evidence |\n| Types | PASS | Explicit |\n\n## Findings\nNo actionable findings.");

  assert.match(rendered, /^╭─ DEVX CREW \/\/ REVIEW/m);
  assert.match(rendered, /✓ Repository\s+example/);
  assert.match(rendered, /◆ Reviewer\s+Grok · high reasoning/);
  assert.match(rendered, /│ Inspecting diff/);
  assert.match(rendered, /│ Found one issue/);
  assert.match(rendered, /\| Types \| PASS \| Explicit \|/);
});
