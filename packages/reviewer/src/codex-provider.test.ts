import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodexReviewProvider, codexReviewArguments } from "./codex-provider.js";

test("runs Codex ephemerally in the read-only sandbox", () => {
  const arguments_ = codexReviewArguments("review prompt", "/work/repository");

  assert.deepEqual(arguments_, [
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    "/work/repository",
    "review prompt",
  ]);
});

test("overrides Codex reasoning effort explicitly", () => {
  const arguments_ = codexReviewArguments("review prompt", "/work/repository", "xhigh");

  assert.deepEqual(arguments_.slice(-3), ["-c", 'model_reasoning_effort="xhigh"', "review prompt"]);
});

test("reports the configured Codex model and reasoning effort", async () => {
  const root = await mkdtemp(join(tmpdir(), "devx-mux-codex-"));
  const repository = join(root, "repository");
  const projectConfiguration = join(repository, ".codex");
  const previousCodexHome = process.env.CODEX_HOME;
  try {
    await mkdir(projectConfiguration, { recursive: true });
    await writeFile(join(root, "config.toml"), 'model = "global-model"\nmodel_reasoning_effort = "medium"\n');
    await writeFile(join(projectConfiguration, "config.toml"), 'model = "project-model"\n');
    process.env.CODEX_HOME = root;

    assert.deepEqual(await new CodexReviewProvider().configuration(repository), {
      model: "project-model",
      reasoningEffort: "medium",
    });
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    await rm(root, { recursive: true, force: true });
  }
});
