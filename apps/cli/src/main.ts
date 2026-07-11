#!/usr/bin/env node

import path from "node:path";
import { GrokReviewProvider, buildReviewPrompt } from "@devx-crew/reviewer";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { discoverRepositoryInstructions, git, resolveRepositoryPath } from "./git.js";

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
  const repositoryPath = await resolveRepositoryPath(options.repositoryPath);
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
      return new GrokReviewProvider().review(prompt, repositoryPath);
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
