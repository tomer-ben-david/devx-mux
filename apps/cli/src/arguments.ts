import { parseArgs } from "node:util";
import type { ReviewScope } from "@devx-crew/reviewer";

export interface ReviewArguments {
  readonly repositoryPath: string;
  readonly scope: ReviewScope;
  readonly provider: "grok" | "codex" | "both";
  readonly reasoningEffort?: "medium" | "high" | "xhigh";
  readonly dryRun: boolean;
}

const ROOT_HELP = `DevX Crew

Usage:
  devx review --help
  devx review branch --provider PROVIDER [options]
  devx review pr [NUMBER] --provider PROVIDER [options]
  devx review commit [REF] --provider PROVIDER [options]
  devx review local --provider PROVIDER [options]
  devx review codebase --provider PROVIDER [options]
`;

export function helpText(): string {
  return ROOT_HELP;
}

export function reviewHelpText(): string {
  return `DevX Crew review

Usage:
  devx review branch --provider <grok|codex|both> [--base origin/main] [--repo PATH] [--dry-run]
  devx review pr [NUMBER] --provider <grok|codex|both> [--base origin/main] [--repo PATH] [--dry-run]
  devx review commit [REF] --provider <grok|codex|both> [--repo PATH] [--dry-run]
  devx review local --provider <grok|codex|both> [--repo PATH] [--dry-run]
  devx review codebase --provider <grok|codex|both> [--reasoning LEVEL] [--repo PATH] [--dry-run]

Scopes:
  pr      Read PR metadata first, then review its branch diff against --base.
  branch  Review HEAD against the merge base with --base.
  commit  Review one commit. REF defaults to HEAD.
  local   Review staged, unstaged, and untracked changes.
  codebase Audit the entire repository at HEAD.

Options:
  --provider NAME  Required review provider. Supported: grok, codex, both.
  --reasoning LEVEL Override reasoning effort. Codex: medium, high, xhigh. Grok: medium, high.
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
      reasoning: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const [scopeName = "branch", scopeValue, ...unexpected] = parsed.positionals;
  if (unexpected.length > 0) {
    throw new Error(`Unexpected arguments: ${unexpected.join(" ")}`);
  }

  let scope: ReviewScope;
  switch (scopeName) {
    case "pr": {
      const number = scopeValue === undefined ? undefined : Number(scopeValue);
      if (number !== undefined && (!Number.isInteger(number) || number <= 0)) {
        throw new Error("Pull-request number must be a positive integer.");
      }
      scope = { kind: "pr", ...(number !== undefined ? { number } : {}), base: parsed.values.base ?? "origin/main" };
      break;
    }
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
    case "codebase":
      if (scopeValue !== undefined) {
        throw new Error("Codebase scope does not accept a reference.");
      }
      scope = { kind: "codebase" };
      break;
    default:
      throw new Error(`Unknown review scope: ${scopeName}`);
  }

  if (parsed.values.provider === undefined) {
    throw new Error("Missing required option: --provider. Supported providers: grok, codex, both.");
  }
  if (parsed.values.provider !== "grok" && parsed.values.provider !== "codex" && parsed.values.provider !== "both") {
    throw new Error(`Unsupported provider: ${parsed.values.provider}. Supported providers: grok, codex, both.`);
  }
  const reasoningEffort = parsed.values.reasoning;
  if (reasoningEffort !== undefined && !["medium", "high", "xhigh"].includes(reasoningEffort)) {
    throw new Error(`Unsupported reasoning effort: ${reasoningEffort}. Supported: medium, high, xhigh.`);
  }
  if ((parsed.values.provider === "grok" || parsed.values.provider === "both") && reasoningEffort === "xhigh") {
    throw new Error("Grok does not support xhigh reasoning. Use medium or high when Grok is selected.");
  }

  return {
    repositoryPath: parsed.values.repo ?? process.cwd(),
    scope,
    provider: parsed.values.provider,
    ...(reasoningEffort !== undefined ? { reasoningEffort: reasoningEffort as "medium" | "high" | "xhigh" } : {}),
    dryRun: parsed.values["dry-run"] ?? false,
  };
}
