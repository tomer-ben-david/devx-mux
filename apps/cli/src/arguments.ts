import { parseArgs } from "node:util";
import type { ReviewScope } from "@devx-crew/reviewer";

export interface ReviewArguments {
  readonly repositoryPath: string;
  readonly scope: ReviewScope;
  readonly provider: "grok" | "codex" | "both";
  readonly reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  readonly codexReasoningEffort?: "low" | "medium" | "high" | "xhigh";
  readonly grokReasoningEffort?: "low" | "medium" | "high";
  readonly outputFormat: "auto" | "tui" | "markdown";
  readonly dryRun: boolean;
}

const ROOT_HELP = `DevX Crew

Usage:
  devx review --help
  devx multireview codebase [options]
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
  devx review branch --provider <grok|codex|both> [--base REF] [--repo PATH] [--dry-run]
  devx review pr [NUMBER] --provider <grok|codex|both> [--base REF] [--repo PATH] [--dry-run]
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
  --reasoning LEVEL Override reasoning effort. Codex: low, medium, high, xhigh. Grok: low, medium, high.
  --codex-reasoning LEVEL Override Codex only. Supported: low, medium, high, xhigh.
  --grok-reasoning LEVEL  Override Grok only. Supported: low, medium, high.
  --format FORMAT    Output format: auto, tui, or markdown. Default: auto.
  --base REF       Explicit branch comparison base. Without it, the reviewer determines the merge base with Git.
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
      base: { type: "string" },
      repo: { type: "string", default: process.cwd() },
      provider: { type: "string" },
      reasoning: { type: "string" },
      "codex-reasoning": { type: "string" },
      "grok-reasoning": { type: "string" },
      format: { type: "string", default: "auto" },
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
      scope = { kind: "pr", ...(number !== undefined ? { number } : {}), ...(parsed.values.base === undefined ? {} : { base: parsed.values.base }) };
      break;
    }
    case "branch":
      if (scopeValue !== undefined) {
        throw new Error("Branch scope does not accept a positional reference. Use --base.");
      }
      scope = { kind: "branch", ...(parsed.values.base === undefined ? {} : { base: parsed.values.base }) };
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
  if (reasoningEffort !== undefined && !["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
    throw new Error(`Unsupported reasoning effort: ${reasoningEffort}. Supported: low, medium, high, xhigh.`);
  }
  if ((parsed.values.provider === "grok" || parsed.values.provider === "both") && reasoningEffort === "xhigh") {
    throw new Error("Grok does not support xhigh reasoning. Use medium or high when Grok is selected.");
  }
  const codexReasoningEffort = parsed.values["codex-reasoning"];
  if (codexReasoningEffort !== undefined && !["low", "medium", "high", "xhigh"].includes(codexReasoningEffort)) {
    throw new Error(`Unsupported Codex reasoning effort: ${codexReasoningEffort}. Supported: low, medium, high, xhigh.`);
  }
  const grokReasoningEffort = parsed.values["grok-reasoning"];
  if (grokReasoningEffort !== undefined && !["low", "medium", "high"].includes(grokReasoningEffort)) {
    throw new Error(`Unsupported Grok reasoning effort: ${grokReasoningEffort}. Supported: low, medium, high.`);
  }
  const outputFormat = parsed.values.format;
  if (outputFormat !== "auto" && outputFormat !== "tui" && outputFormat !== "markdown") {
    throw new Error(`Unsupported output format: ${outputFormat}. Supported: auto, tui, markdown.`);
  }

  return {
    repositoryPath: parsed.values.repo ?? process.cwd(),
    scope,
    provider: parsed.values.provider,
    ...(reasoningEffort !== undefined ? { reasoningEffort: reasoningEffort as "low" | "medium" | "high" | "xhigh" } : {}),
    ...(codexReasoningEffort !== undefined ? { codexReasoningEffort: codexReasoningEffort as "low" | "medium" | "high" | "xhigh" } : {}),
    ...(grokReasoningEffort !== undefined ? { grokReasoningEffort: grokReasoningEffort as "low" | "medium" | "high" } : {}),
    outputFormat,
    dryRun: parsed.values["dry-run"] ?? false,
  };
}
