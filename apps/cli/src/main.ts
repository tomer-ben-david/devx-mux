#!/usr/bin/env node

import path from "node:path";
import { CodexReviewProvider, GrokReviewProvider, buildReviewPrompt } from "@devx-crew/reviewer";
import { TerminalReporter } from "@devx-crew/terminal-ui";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { resolveRepositoryPath } from "./git.js";

const STANDARDS_URL = "https://github.com/tomer-ben-david/devx-coding-standards";

async function run(argv: readonly string[]): Promise<number> {
  const [command, ...commandArguments] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(helpText());
    return 0;
  }
  if (command !== "review") {
    throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
  }
  if (commandArguments.includes("--help") || commandArguments.includes("-h")) {
    process.stdout.write(reviewHelpText());
    return 0;
  }

  const options = parseReviewArguments(commandArguments);
  const reporter = new TerminalReporter();
  const repositoryPath = await resolveRepositoryPath(options.repositoryPath);
  const scopeLabel = options.scope.kind === "local"
    ? "Local changes"
    : options.scope.kind === "codebase"
      ? "Full codebase"
      : options.scope.kind;
  const providerLabel = options.provider === "grok" ? "Grok" : "Codex";
  reporter.heading("Review", `${scopeLabel} · ${providerLabel}`);
  reporter.success("Repository", path.basename(repositoryPath));

  reporter.success("Scope", scopeLabel);
  const request = {
    scope: options.scope,
    standardsReference: process.env.DEVX_STANDARDS_PATH ?? STANDARDS_URL,
  };
  const prompt = buildReviewPrompt(request);

  if (options.dryRun) {
    process.stdout.write(prompt);
    return 0;
  }

  const provider = options.provider === "grok"
    ? new GrokReviewProvider()
    : new CodexReviewProvider();
  const providerDetail = options.provider === "grok"
    ? "Grok · high reasoning · verification enabled"
    : "Codex · read-only · ephemeral";
  try {
    reporter.success("Provider", `${await provider.version()} · model: provider default`);
  } catch (error) {
    reporter.failure(error instanceof Error ? error.message : String(error));
    return 1;
  }
  reporter.active("Reviewer", providerDetail);

  try {
    const execution = await provider.review(
      prompt,
      repositoryPath,
      (update) => {
        reporter.updateActivity("Reviewer", update.status);
        if (update.kind !== undefined && update.text !== undefined) {
          reporter.live(update.kind, update.text);
        }
      },
    );
    if (execution.exitCode !== 0) {
      reporter.failure(execution.error ?? `${providerLabel} exited with status ${execution.exitCode}`);
      return execution.exitCode;
    }
    if (execution.finalText.trim().length === 0) {
      reporter.failure(`${providerLabel} returned no final review`);
      return 1;
    }

    reporter.document(execution.finalText);
    if (execution.usage !== undefined) {
      reporter.usage([
        ...(execution.usage.inputTokens !== undefined ? [`${execution.usage.inputTokens.toLocaleString()} input`] : []),
        ...(execution.usage.cachedInputTokens !== undefined ? [`${execution.usage.cachedInputTokens.toLocaleString()} cached`] : []),
        ...(execution.usage.outputTokens !== undefined ? [`${execution.usage.outputTokens.toLocaleString()} output`] : []),
        ...(execution.usage.reasoningTokens !== undefined ? [`${execution.usage.reasoningTokens.toLocaleString()} reasoning`] : []),
        "quota remaining: unavailable",
      ]);
    }
    const p1 = (execution.finalText.match(/^###? P1\b/gm) ?? []).length;
    const p2 = (execution.finalText.match(/^###? P2\b/gm) ?? []).length;
    const p3 = (execution.finalText.match(/^###? P3\b/gm) ?? []).length;
    reporter.result(`${p1} P1 · ${p2} P2 · ${p3} P3`);
    return 0;
  } catch (error) {
    reporter.failure(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

run(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`devx: ${message}\n`);
    process.exitCode = 1;
  });
