import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDirectory, "staged-review.ts");
const muxSkill = path.resolve(scriptDirectory, "..", "..", "devx-mux");

test("renders every stage without unresolved template values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devx-mux-staged-review-"));
  for (const stage of ["1", "2", "3", "4"]) {
    const promptFile = path.join(root, `stage-${stage}.txt`);
    execFileSync(process.execPath, [script, "send", stage, "chatgpt", promptFile], {
      env: {
        ...process.env,
        DEVX_MUX_SKILL_DIR: muxSkill,
        STAGED_REVIEW_DRY_RUN: "1",
        STAGED_PR_URL: "https://github.com/example/project/pull/42",
        STAGED_COMPARE_URL: "https://github.com/example/project/compare/base...feature",
        STAGED_BASE: "base",
        STAGED_BRANCH: "feature",
        STAGED_COMMIT: "abc1234",
        STAGED_COMMIT_SUBJECT: "share review transports",
        STAGED_REQUEST_ID: `stage-${stage}`,
      },
      stdio: "ignore",
    });
    const prompt = readFileSync(promptFile, "utf8");
    assert.match(prompt, new RegExp(`REQUEST_ID=stage-${stage}`));
    assert.doesNotMatch(prompt, /\{\{[^}]+\}\}/);
  }
});

test("preserves template-like text inside replacement values", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devx-mux-staged-review-values-"));
  const promptFile = path.join(root, "stage-1.txt");
  execFileSync(process.execPath, [script, "send", "1", "chatgpt", promptFile], {
    env: {
      ...process.env,
      DEVX_MUX_SKILL_DIR: muxSkill,
      STAGED_REVIEW_DRY_RUN: "1",
      STAGED_PR_URL: "https://github.com/example/project/pull/42",
      STAGED_COMPARE_URL: "https://github.com/example/project/compare/base...feature",
      STAGED_COMMIT: "abc1234",
      STAGED_COMMIT_SUBJECT: "document {{HEAD}} literally",
      STAGED_REQUEST_ID: "stage-template-value",
    },
    stdio: "ignore",
  });

  assert.match(readFileSync(promptFile, "utf8"), /document \{\{HEAD\}\} literally/);
});
