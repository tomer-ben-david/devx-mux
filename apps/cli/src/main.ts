#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexReviewProvider, GrokReviewProvider, buildReviewPrompt, parseReviewReport } from "@devx-crew/reviewer";
import { TerminalReporter } from "@devx-crew/terminal-ui";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { resolveRepositoryPath } from "./git.js";

const STANDARDS_URL = "https://github.com/tomer-ben-david/devx-coding-standards";

function compactNumber(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  if (value < 1_000_000) return `${Number((value / 1_000).toFixed(value < 10_000 ? 1 : 0))}K`;
  return `${Number((value / 1_000_000).toFixed(1))}M`;
}

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
    ? new GrokReviewProvider(options.reasoningEffort === "medium" ? "medium" : "high")
    : new CodexReviewProvider(options.reasoningEffort);
  let providerVersion = provider.name;
  let providerModel = "provider default";
  let providerReasoning: string | undefined;
  try {
    const configuration = await provider.configuration?.(repositoryPath);
    providerVersion = await provider.version();
    providerModel = configuration?.model ?? "provider default";
    providerReasoning = configuration?.reasoningEffort;
    const reasoning = providerReasoning !== undefined
      ? ` · ${providerReasoning} reasoning`
      : "";
    reporter.success("Provider", `${providerVersion} · ${providerModel}${reasoning}`);
  } catch (error) {
    reporter.failure(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const providerDetail = options.provider === "grok"
    ? `Grok · ${providerReasoning ?? "default"} reasoning · verification enabled`
    : "Codex · read-only · ephemeral";
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
    const report = parseReviewReport(execution.finalText);

    const reportDirectory = path.join(tmpdir(), "devx-crew");
    await mkdir(reportDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDirectory, `${path.basename(repositoryPath)}-${options.scope.kind}-${timestamp}.md`);
    const exactUsage = execution.usage === undefined ? [] : [
      ...(execution.usage.inputTokens !== undefined ? [`Input tokens: ${execution.usage.inputTokens.toLocaleString()}`] : []),
      ...(execution.usage.cachedInputTokens !== undefined ? [`Cached input tokens: ${execution.usage.cachedInputTokens.toLocaleString()}`] : []),
      ...(execution.usage.outputTokens !== undefined ? [`Output tokens: ${execution.usage.outputTokens.toLocaleString()}`] : []),
      ...(execution.usage.reasoningTokens !== undefined ? [`Reasoning tokens: ${execution.usage.reasoningTokens.toLocaleString()}`] : []),
    ];
    const artifactUsage = exactUsage.length > 0 ? `\n\n---\n\n## Provider usage\n\n${exactUsage.map((line) => `- ${line}`).join("\n")}\n` : "\n";
    const artifactProvider = [`Provider: ${providerVersion}`, `Model: ${providerModel}`, ...(providerReasoning !== undefined ? [`Reasoning effort: ${providerReasoning}`] : [])];
    await writeFile(reportPath, `${report.markdown}\n\n---\n\n## Provider\n\n${artifactProvider.map((line) => `- ${line}`).join("\n")}${artifactUsage}`, "utf8");
    reporter.document(report);
    reporter.artifact(reportPath);
    if (execution.usage !== undefined) {
      reporter.usage([
        ...(execution.usage.inputTokens !== undefined ? [`${compactNumber(execution.usage.inputTokens)} in`] : []),
        ...(execution.usage.cachedInputTokens !== undefined ? [`${compactNumber(execution.usage.cachedInputTokens)} cached`] : []),
        ...(execution.usage.outputTokens !== undefined ? [`${compactNumber(execution.usage.outputTokens)} out`] : []),
        ...(execution.usage.reasoningTokens !== undefined ? [`${compactNumber(execution.usage.reasoningTokens)} reasoning`] : []),
        "quota remaining: unavailable",
      ]);
    }
    const p1 = report.findings.filter((finding) => finding.severity === "P1").length;
    const p2 = report.findings.filter((finding) => finding.severity === "P2").length;
    const p3 = report.findings.filter((finding) => finding.severity === "P3").length;
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
