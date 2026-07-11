import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import type { ReviewReport } from "@devx-crew/reviewer";
import { TerminalReporter } from "./terminal-reporter.js";

function report(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    markdown: "## Review target\nExample",
    standards: [{ item: "Types", status: "PASS", evidence: "Explicit" }],
    findings: [],
    verificationGaps: [],
    ...overrides,
  };
}

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
  reporter.document(report());

  assert.match(rendered, /^╭─ DEVX CREW \/\/ REVIEW/m);
  assert.match(rendered, /✓ Repository\s+example/);
  assert.match(rendered, /◆ Reviewer\s+Grok · high reasoning/);
  assert.match(rendered, /│ Inspecting diff/);
  assert.match(rendered, /│ Found one issue/);
  assert.match(rendered, /## Review target/);
});

test("renders provider activity without allowing terminal escapes", () => {
  const output = new PassThrough();
  let rendered = "";
  output.on("data", (chunk) => { rendered += chunk.toString(); });
  const reporter = new TerminalReporter({ output, color: false, animated: false });

  reporter.live("tool", "git status");
  reporter.live("reasoning", "checking risks\u001B[2J");
  reporter.live("message", "review ready");

  assert.match(rendered, /│ › git status/);
  assert.match(rendered, /│ ◆ checking risks/);
  assert.match(rendered, /│ │ review ready/);
  assert.doesNotMatch(rendered, /\u001B\[2J/);
});

test("wraps live activity instead of truncating it", () => {
  const output = new PassThrough() as PassThrough & { isTTY: boolean; columns: number };
  output.isTTY = true;
  output.columns = 40;
  let rendered = "";
  output.on("data", (chunk) => { rendered += chunk.toString(); });
  const reporter = new TerminalReporter({ output, color: false, animated: true });

  reporter.active("Reviewer", "Inspecting");
  reporter.live("message", "Another deliberately long reviewer message that must remain complete");
  reporter.result("done");

  assert.doesNotMatch(rendered, /…/);
  assert.match(rendered, /must remain complete/);
});

test("renders an interactive review as a scannable dashboard", () => {
  const output = new PassThrough() as PassThrough & { isTTY: boolean; columns: number };
  output.isTTY = true;
  output.columns = 100;
  let rendered = "";
  output.on("data", (chunk) => { rendered += chunk.toString(); });
  const reporter = new TerminalReporter({ output, color: false, animated: false });

  reporter.document(report({
    standards: [
      { item: "Types", status: "PASS", evidence: "Explicit types" },
      { item: "Output contract", status: "FAIL", evidence: "See P2 finding 1" },
      { item: "Swift", status: "N/A", evidence: "No Swift" },
    ],
    findings: [{
      severity: "P2",
      title: "Validate provider output",
      location: "main.ts:74",
      consequence: "Malformed output can be reported as successful.",
      correction: "Validate it once.",
    }],
    verificationGaps: ["Windows was not exercised."],
  }));

  assert.match(rendered, /REVIEW COMPLETED/);
  assert.match(rendered, /Execution   PASS  Reviewer finished successfully/);
  assert.match(rendered, /Verdict     CHANGES RECOMMENDED  1 issue found/);
  assert.match(rendered, /Standards   1 met  1 violated  1 not applicable/);
  assert.match(rendered, /P2 IMPORTANT  Validate provider output/);
  assert.match(rendered, /PASS  Types/);
  assert.match(rendered, /FAIL  Output contract/);
  assert.match(rendered, /Not verified/);
  assert.doesNotMatch(rendered, /\| Item \| Status/);
});
