import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPrompt } from "./prompt.js";

const baseRequest = {
  standardsReference: "https://example.com/standards",
} as const;

test("branch review uses an explicitly selected merge-base diff", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "branch", base: "origin/main" },
  });

  assert.match(prompt, /current branch changes relative to the merge base with origin\/main/);
  assert.match(prompt, /Do not report pre-existing issues/);
  assert.match(prompt, /make that conclusion unambiguous/);
  assert.match(prompt, /# Role: reviewer/);
  assert.match(prompt, /# Persona: exacting-engineer/);
  assert.match(prompt, /# Protocol: deep-code-review/);
  assert.match(prompt, /Try to disprove every candidate finding before reporting it/);
  assert.match(prompt, /structural simplifications that remove complexity rather than rearrange it/);
});

test("branch review asks Git for the merge base instead of assuming main", () => {
  const prompt = buildReviewPrompt({ ...baseRequest, scope: { kind: "branch" } });
  assert.match(prompt, /Use Git to determine the appropriate comparison base and actual merge base/);
  assert.doesNotMatch(prompt, /origin\/main/);
});

test("commit review identifies the selected commit", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "commit", ref: "HEAD~1" },
  });

  assert.match(prompt, /Review commit HEAD~1 only/);
});

test("pull request review reads stated intent before the diff", () => {
  const prompt = buildReviewPrompt({
    scope: { kind: "pr", number: 42, base: "origin/main" },
    standardsReference: "https://example.com/standards",
  });
  assert.match(prompt, /read its title and description/);
  assert.match(prompt, /description may be stale/);
});

test("local review covers staged, unstaged, and untracked changes", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "local" },
  });

  assert.match(prompt, /staged, unstaged, and untracked/);
  assert.match(prompt, /Choose your own read-only repository tools/);
});

test("codebase review uses the repository-wide audit protocol", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "codebase" },
  });

  assert.match(prompt, /# Protocol: full-codebase-audit/);
  assert.match(prompt, /Audit the entire current repository state/);
  assert.match(prompt, /Existing issues are in scope/);
  assert.doesNotMatch(prompt, /Do not report pre-existing issues outside that scope/);
});
