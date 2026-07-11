#!/usr/bin/env node

import path from "node:path";
import { GrokReviewProvider, buildReviewPrompt } from "@devx-crew/reviewer";
import { TerminalReporter } from "@devx-crew/terminal-ui";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { discoverRepositoryInstructions, git, inspectLocalChanges, resolveRepositoryPath } from "./git.js";

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
  reporter.heading("Review", `${scopeLabel} · ${options.provider === "grok" ? "Grok" : options.provider}`);
  reporter.success("Repository", path.basename(repositoryPath));

  if (options.scope.kind === "local") {
    const changes = await inspectLocalChanges(repositoryPath);
    if (changes.files === 0) {
      reporter.success("Scope", "Working tree clean");
      reporter.empty("No staged, unstaged, or untracked changes.");
      return 0;
    }
    const details = [
      `${changes.files} ${changes.files === 1 ? "file" : "files"}`,
      changes.staged > 0 ? `${changes.staged} staged` : undefined,
      changes.modified > 0 ? `${changes.modified} modified` : undefined,
      changes.untracked > 0 ? `${changes.untracked} untracked` : undefined,
    ].filter((value): value is string => value !== undefined);
    reporter.success("Scope", details.join(" · "));
  } else {
    reporter.success("Scope", scopeLabel);
  }
  const request = {
    repositoryPath,
    repositoryName: path.basename(repositoryPath),
    head: await git(repositoryPath, ["rev-parse", "HEAD"]),
    scope: options.scope,
    standardsReference: process.env.DEVX_STANDARDS_PATH ?? STANDARDS_URL,
    repositoryInstructions: await discoverRepositoryInstructions(repositoryPath),
  };
  const prompt = buildReviewPrompt(request);

  if (options.dryRun) {
    process.stdout.write(prompt);
    return 0;
  }

  switch (options.provider) {
    case "grok":
      reporter.active("Reviewer", "Grok · high reasoning · verification enabled");
      let exitCode: number;
      try {
        exitCode = await new GrokReviewProvider().review(
          prompt,
          repositoryPath,
          (chunk) => reporter.providerChunk(chunk),
        );
      } catch (error) {
        reporter.failure(error instanceof Error ? error.message : String(error));
        return 1;
      }
      reporter.flushProvider();
      if (exitCode === 0) {
        reporter.result("Review finished");
      } else {
        reporter.failure(`Grok exited with status ${exitCode}`);
      }
      return exitCode;
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
