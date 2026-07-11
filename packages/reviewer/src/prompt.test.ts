import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPrompt } from "./prompt.js";

const baseRequest = {
  standardsReference: "https://example.com/standards",
} as const;

test("branch review uses a merge-base diff and introduced-code scope", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "branch", base: "origin/main" },
  });

  assert.match(prompt, /current branch changes relative to origin\/main/);
  assert.match(prompt, /Do not report pre-existing issues/);
  assert.match(prompt, /No actionable findings/);
  assert.match(prompt, /# Role: reviewer/);
  assert.match(prompt, /# Persona: exacting-engineer/);
  assert.match(prompt, /# Protocol: deep-code-review/);
  assert.match(prompt, /Actively try to disprove candidate findings/);
  assert.match(prompt, /simpler designs that remove complexity rather than rearrange it/);
});

test("commit review identifies the selected commit", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "commit", ref: "HEAD~1" },
  });

  assert.match(prompt, /Review commit HEAD~1 only/);
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
  assert.match(prompt, /Audit the entire repository at HEAD/);
  assert.match(prompt, /Existing issues are in scope/);
  assert.doesNotMatch(prompt, /Do not report pre-existing issues outside that scope/);
});
