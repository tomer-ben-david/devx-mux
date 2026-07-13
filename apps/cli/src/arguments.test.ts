import assert from "node:assert/strict";
import test from "node:test";
import { helpText, parseReviewArguments, reviewHelpText, versionText } from "./arguments.js";

test("documents and renders the version command", () => {
  const help = helpText();
  assert.match(help, /mux --version/);
  assert.match(help, /mux multireview branch/);
  assert.match(help, /mux multireview pr \[NUMBER\]/);
  assert.match(help, /mux multireview commit \[REF\]/);
  assert.match(help, /mux multireview local/);
  assert.match(help, /mux multireview codebase/);
  assert.equal(versionText("1.2.3"), "DevX Mux 1.2.3\n");
});

test("defaults to branch review without assuming a base branch", () => {
  const result = parseReviewArguments(["--provider", "grok"]);

  assert.deepEqual(result.scope, { kind: "branch" });
  assert.equal(result.outputFormat, "auto");
  assert.equal(result.provider, "grok");
  assert.equal(result.dryRun, false);
});

test("parses a selected commit and dry-run", () => {
  const result = parseReviewArguments(["commit", "HEAD~2", "--provider", "grok", "--dry-run"]);

  assert.deepEqual(result.scope, { kind: "commit", ref: "HEAD~2" });
  assert.equal(result.dryRun, true);
});

test("rejects a reference for local review", () => {
  assert.throws(
    () => parseReviewArguments(["local", "HEAD", "--provider", "grok"]),
    /Local scope does not accept a reference/,
  );
});

test("requires an explicit provider", () => {
  assert.throws(
    () => parseReviewArguments(["branch"]),
    /Missing required option: --provider/,
  );
});

test("rejects an unsupported provider", () => {
  assert.throws(
    () => parseReviewArguments(["branch", "--provider", "claude"]),
    /Unsupported provider: claude/,
  );
});

test("parses a full codebase audit", () => {
  const result = parseReviewArguments(["codebase", "--provider", "codex", "--reasoning", "xhigh"]);

  assert.deepEqual(result.scope, { kind: "codebase" });
  assert.equal(result.provider, "codex");
  assert.equal(result.reasoningEffort, "xhigh");
});

test("parses a pull request with its comparison base", () => {
  const result = parseReviewArguments(["pr", "42", "--provider", "codex", "--base", "origin/develop"]);
  assert.deepEqual(result.scope, { kind: "pr", number: 42, base: "origin/develop" });
});

test("rejects xhigh reasoning for Grok", () => {
  assert.throws(
    () => parseReviewArguments(["codebase", "--provider", "grok", "--reasoning", "xhigh"]),
    /Grok does not support xhigh/,
  );
});

test("parses parallel Codex and Grok review", () => {
  const result = parseReviewArguments(["codebase", "--provider", "both", "--codex-reasoning", "xhigh", "--grok-reasoning", "high"]);
  assert.equal(result.provider, "both");
  assert.equal(result.codexReasoningEffort, "xhigh");
  assert.equal(result.grokReasoningEffort, "high");
});

test("supports low reasoning for inexpensive parallel smoke tests", () => {
  const result = parseReviewArguments(["codebase", "--provider", "both", "--reasoning", "low"]);
  assert.equal(result.reasoningEffort, "low");
});

test("supports clean Markdown output for agent callers", () => {
  const result = parseReviewArguments(["codebase", "--provider", "both", "--format", "markdown"]);
  assert.equal(result.outputFormat, "markdown");
});

test("parses review instructions and trims surrounding whitespace", () => {
  const result = parseReviewArguments([
    "branch",
    "--provider",
    "both",
    "--instructions",
    "  Review shipped runtime code only.  ",
  ]);

  assert.equal(result.instructions, "Review shipped runtime code only.");
});

test("rejects empty review instructions", () => {
  assert.throws(
    () => parseReviewArguments(["branch", "--provider", "both", "--instructions", "   "]),
    /--instructions must not be empty/,
  );
});

test("documents instructions in multireview help without requiring a provider", () => {
  const help = reviewHelpText("multireview");

  assert.match(help, /mux multireview branch/);
  assert.match(help, /--instructions TEXT/);
  assert.doesNotMatch(help, /Required review provider/);
});
