import { parseArgs } from "node:util";
import type { ReviewScope } from "@devx-crew/reviewer";

export interface ReviewArguments {
  readonly repositoryPath: string;
  readonly scope: ReviewScope;
  readonly provider: "grok";
  readonly dryRun: boolean;
}

const ROOT_HELP = `DevX Crew

Usage:
  devx review --help
  devx review branch --provider PROVIDER [options]
  devx review commit [REF] --provider PROVIDER [options]
  devx review local --provider PROVIDER [options]
`;

export function helpText(): string {
  return ROOT_HELP;
}

export function reviewHelpText(): string {
  return `DevX Crew review

Usage:
  devx review branch --provider grok [--base origin/main] [--repo PATH] [--dry-run]
  devx review commit [REF] --provider grok [--repo PATH] [--dry-run]
  devx review local --provider grok [--repo PATH] [--dry-run]

Scopes:
  branch  Review HEAD against the merge base with --base.
  commit  Review one commit. REF defaults to HEAD.
  local   Review staged, unstaged, and untracked changes.

Options:
  --provider NAME  Required review provider. Supported: grok.
  --base REF       Branch comparison base. Default: origin/main.
  --repo PATH      Repository to review. Default: current directory.
  --dry-run        Print the composed prompt without invoking the provider.
  -h, --help       Show this help.
`;
}

export function parseReviewArguments(argv: readonly string[]): ReviewArguments {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      base: { type: "string", default: "origin/main" },
      repo: { type: "string", default: process.cwd() },
      provider: { type: "string" },
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

  if (parsed.values.provider === undefined) {
    throw new Error("Missing required option: --provider. Supported providers: grok.");
  }
  if (parsed.values.provider !== "grok") {
    throw new Error(`Unsupported provider: ${parsed.values.provider}. Supported providers: grok.`);
  }

  return {
    repositoryPath: parsed.values.repo ?? process.cwd(),
    scope,
    provider: parsed.values.provider,
    dryRun: parsed.values["dry-run"] ?? false,
  };
}
