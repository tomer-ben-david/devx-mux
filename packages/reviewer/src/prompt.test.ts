import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewPrompt } from "./prompt.js";

const baseRequest = {
  repositoryPath: "/work/example",
  repositoryName: "example",
  head: "abc123",
  standardsReference: "https://example.com/standards",
  repositoryInstructions: ["/work/example/AGENTS.md"],
} as const;

test("branch review uses a merge-base diff and introduced-code scope", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "branch", base: "origin/main" },
  });

  assert.match(prompt, /git diff origin\/main\.\.\.HEAD/);
  assert.match(prompt, /Do not report pre-existing issues/);
  assert.match(prompt, /No actionable findings/);
  assert.match(prompt, /# Role: reviewer/);
  assert.match(prompt, /# Persona: exacting-engineer/);
  assert.match(prompt, /# Protocol: deep-code-review/);
  assert.match(prompt, /actively search for code, tests, types, or repository instructions that disprove it/);
  assert.match(prompt, /different framing could delete complexity rather than relocate it/);
});

test("commit review identifies the selected commit", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    scope: { kind: "commit", ref: "HEAD~1" },
  });

  assert.match(prompt, /git show --find-renames HEAD~1/);
});

test("local review covers staged, unstaged, and untracked changes", () => {
  const prompt = buildReviewPrompt({
    ...baseRequest,
    repositoryInstructions: [],
    scope: { kind: "local" },
  });

  assert.match(prompt, /staged, unstaged, and untracked/);
  assert.match(prompt, /No repository instruction files were discovered/);
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
