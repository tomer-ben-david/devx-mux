import { parseArgs } from "node:util";
import type { ReviewScope } from "@devx-crew/reviewer";

export interface ReviewArguments {
  readonly repositoryPath: string;
  readonly scope: ReviewScope;
  readonly dryRun: boolean;
}

const HELP = `DevX Crew

Usage:
  devx review branch [--base origin/main] [--repo PATH] [--dry-run]
  devx review commit [REF] [--repo PATH] [--dry-run]
  devx review local [--repo PATH] [--dry-run]
`;

export function helpText(): string {
  return HELP;
}

export function parseReviewArguments(argv: readonly string[]): ReviewArguments {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      base: { type: "string", default: "origin/main" },
      repo: { type: "string", default: process.cwd() },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const [scopeName = "branch", scopeValue, ...unexpected] = parsed.positionals;
  if (unexpected.length > 0) {
    throw new Error(`Unexpected arguments: ${unexpected.join(" ")}`);
  }

  let scope: ReviewScope;
  switch (scopeName) {
    case "branch":
      if (scopeValue !== undefined) {
        throw new Error("Branch scope does not accept a positional reference. Use --base.");
      }
      scope = { kind: "branch", base: parsed.values.base ?? "origin/main" };
      break;
    case "commit":
      scope = { kind: "commit", ref: scopeValue ?? "HEAD" };
      break;
    case "local":
      if (scopeValue !== undefined) {
        throw new Error("Local scope does not accept a reference.");
      }
      scope = { kind: "local" };
      break;
    default:
      throw new Error(`Unknown review scope: ${scopeName}`);
  }

  return {
    repositoryPath: parsed.values.repo ?? process.cwd(),
    scope,
    dryRun: parsed.values["dry-run"] ?? false,
  };
}

