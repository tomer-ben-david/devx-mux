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

  assert.match(rendered, /^╭─ DEVX CREW \/\/ REVIEW/m);
  assert.match(rendered, /✓ Repository\s+example/);
  assert.match(rendered, /◆ Reviewer\s+Grok · high reasoning/);
  assert.match(rendered, /│ Inspecting diff/);
  assert.match(rendered, /│ Found one issue/);
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
