import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("routes both Rex product names through the Rex transport", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devx-mux-staged-rex-target-"));
  try {
    const fakeMuxSkill = path.join(root, "devx-mux");
    const scripts = path.join(fakeMuxSkill, "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(fakeMuxSkill, "SKILL.md"), "# test skill\n");
    writeFileSync(path.join(scripts, "rex-review-send.sh"), "#!/bin/sh\nexit 0\n");
    writeFileSync(path.join(scripts, "cmux-review-send.sh"), "#!/bin/sh\nexit 9\n");
    chmodSync(path.join(scripts, "rex-review-send.sh"), 0o755);
    chmodSync(path.join(scripts, "cmux-review-send.sh"), 0o755);

    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("APP_NAME_")),
    );
    for (const appName of ["Rex", "RexIDE"]) {
      execFileSync(process.execPath, [script, "send", "1", path.join(root, `${appName}.txt`)], {
        env: {
          ...environment,
          APP_NAME_TEST: appName,
          DEVX_MUX_SKILL_DIR: fakeMuxSkill,
          STAGED_PR_URL: "https://github.com/example/project/pull/42",
          STAGED_COMPARE_URL: "https://github.com/example/project/compare/base...feature",
          STAGED_REQUEST_ID: `stage-${appName.toLowerCase()}`,
        },
        stdio: "ignore",
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
