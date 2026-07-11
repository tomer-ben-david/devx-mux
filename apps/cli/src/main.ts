#!/usr/bin/env node

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { CodexReviewProvider, GrokReviewProvider, buildReviewPrompt, parseReviewReport } from "@devx-crew/reviewer";
import { TerminalReporter } from "@devx-crew/terminal-ui";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { resolveRepositoryPath } from "./git.js";
import { reviewArtifactDirectory } from "./artifacts.js";

const STANDARDS_URL = "https://github.com/tomer-ben-david/devx-coding-standards";

function compactNumber(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  if (value < 1_000_000) return `${Number((value / 1_000).toFixed(value < 10_000 ? 1 : 0))}K`;
  return `${Number((value / 1_000_000).toFixed(1))}M`;
}

async function runBothProviders(commandArguments: readonly string[], repositoryPath: string, scopeKind: string): Promise<number> {
  const entryPoint = process.argv[1];
  if (entryPoint === undefined) throw new Error("Cannot resolve the DevX Crew entry point.");
  const providerIndex = commandArguments.indexOf("--provider");
  if (providerIndex < 0) throw new Error("Cannot run both reviewers without --provider.");
  const interactive = process.stdout.isTTY === true;
  const activity: Record<"codex" | "grok", string> = { codex: "Starting reviewer", grok: "Starting reviewer" };
  const completed: Record<"codex" | "grok", boolean> = { codex: false, grok: false };
  let renderTimer: NodeJS.Timeout | undefined;
  const renderDashboard = (): void => {
    renderTimer = undefined;
    const width = Math.max(40, (process.stdout.columns ?? 100) - 14);
    const row = (provider: "codex" | "grok", color: number): string => {
      const label = provider === "codex" ? "CODEX" : "GROK ";
      const icon = completed[provider] ? "✓" : "◆";
      const detail = activity[provider].replace(/\s+/g, " ").trim().slice(-width);
      return `\x1b[2K\x1b[${color}m${icon} ${label}\x1b[0m  ${detail}`;
    };
    process.stdout.write(`\x1b[2A${row("codex", 36)}\n${row("grok", 35)}\n`);
  };
  const updateDashboard = (provider: "codex" | "grok", rawLine: string): void => {
    const line = rawLine.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").trim();
    if (line.length === 0) return;
    activity[provider] = line.length < 28
      ? `${activity[provider]} ${line}`.split(/\s+/).slice(-16).join(" ")
      : line;
    if (renderTimer === undefined) renderTimer = setTimeout(renderDashboard, 80);
  };

  const runProvider = (provider: "codex" | "grok"): Promise<{ readonly exitCode: number; readonly output: string }> => new Promise((resolve, reject) => {
    const childArguments = [...commandArguments];
    childArguments[providerIndex + 1] = provider;
    const child = spawn(process.execPath, [entryPoint, "review", ...childArguments], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const label = provider === "codex" ? "Codex" : "Grok";
    let capturedOutput = "";
    const forward = (target: NodeJS.WriteStream) => {
      let pending = "";
      return {
        chunk(value: Buffer): void {
          const text = value.toString("utf8");
          capturedOutput += text;
          pending += text;
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (interactive) updateDashboard(provider, line);
            else target.write(`[${label}] ${line}\n`);
          }
        },
        flush(): void {
          if (pending.length > 0) {
            if (interactive) updateDashboard(provider, pending);
            else target.write(`[${label}] ${pending}\n`);
          }
        },
      };
    };
    const stdout = forward(process.stdout);
    const stderr = forward(process.stderr);
    child.stdout.on("data", stdout.chunk);
    child.stderr.on("data", stderr.chunk);
    child.once("error", reject);
    child.once("close", (code) => {
      stdout.flush();
      stderr.flush();
      completed[provider] = true;
      activity[provider] = code === 0 ? "Review complete" : `Reviewer failed with exit ${code ?? 1}`;
      if (interactive) renderDashboard();
      resolve({ exitCode: code ?? 1, output: capturedOutput });
    });
  });

  if (interactive) {
    process.stdout.write("\x1b[36m◆ CODEX\x1b[0m  Starting reviewer\n\x1b[35m◆ GROK \x1b[0m  Starting reviewer\n");
  } else {
    process.stdout.write("DevX Crew: starting Codex and Grok in parallel.\n");
  }
  const [codex, grok] = await Promise.all([runProvider("codex"), runProvider("grok")]);
  if (renderTimer !== undefined) clearTimeout(renderTimer);
  if (codex.exitCode === 0 && grok.exitCode === 0) {
    const reportPath = (output: string): string | undefined => output.match(/^Full report (.+)$/m)?.[1]?.trim();
    const codexReportPath = reportPath(codex.output);
    const grokReportPath = reportPath(grok.output);
    if (codexReportPath === undefined || grokReportPath === undefined) {
      process.stderr.write("DevX Crew: both reviewers finished but an independent report path was missing.\n");
      return 1;
    }
    const [codexMarkdown, grokMarkdown] = await Promise.all([
      readFile(codexReportPath, "utf8"),
      readFile(grokReportPath, "utf8"),
    ]);
    const directory = reviewArtifactDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const combinedPath = path.join(directory, `${path.basename(repositoryPath)}-${scopeKind}-both-${timestamp}.md`);
    await writeFile(combinedPath, `# DevX Crew parallel review\n\nCodex and Grok reviewed the same scope independently and concurrently. Disagreements are intentionally preserved.\n\n## Codex review\n\n${codexMarkdown}\n\n## Grok review\n\n${grokMarkdown}\n`, { encoding: "utf8", mode: 0o600 });
    process.stdout.write(`DevX Crew: both reviewers completed.\nFull report ${combinedPath}\n`);
    return 0;
  }
  process.stderr.write(`DevX Crew: parallel review incomplete (Codex ${codex.exitCode}, Grok ${grok.exitCode}).\n`);
  return codex.exitCode !== 0 ? codex.exitCode : grok.exitCode;
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
      : options.scope.kind === "pr"
        ? `Pull request${options.scope.number === undefined ? "" : ` #${options.scope.number}`}`
      : options.scope.kind;
  const providerLabel = options.provider === "grok" ? "Grok" : options.provider === "codex" ? "Codex" : "Codex + Grok";
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

  if (options.provider === "both") {
    return runBothProviders(commandArguments, repositoryPath, options.scope.kind);
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

    const reportDirectory = reviewArtifactDirectory();
    await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
    await chmod(reportDirectory, 0o700);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(reportDirectory, `${path.basename(repositoryPath)}-${options.scope.kind}-${timestamp}.md`);
    const summaryPath = path.join(reportDirectory, `${path.basename(repositoryPath)}-${options.scope.kind}-${timestamp}-summary.md`);
    const exactUsage = execution.usage === undefined ? [] : [
      ...(execution.usage.inputTokens !== undefined ? [`Input tokens: ${execution.usage.inputTokens.toLocaleString()}`] : []),
      ...(execution.usage.cachedInputTokens !== undefined ? [`Cached input tokens: ${execution.usage.cachedInputTokens.toLocaleString()}`] : []),
      ...(execution.usage.outputTokens !== undefined ? [`Output tokens: ${execution.usage.outputTokens.toLocaleString()}`] : []),
      ...(execution.usage.reasoningTokens !== undefined ? [`Reasoning tokens: ${execution.usage.reasoningTokens.toLocaleString()}`] : []),
    ];
    const artifactUsage = exactUsage.length > 0 ? `\n\n---\n\n## Provider usage\n\n${exactUsage.map((line) => `- ${line}`).join("\n")}\n` : "\n";
    const artifactProvider = [`Provider: ${providerVersion}`, `Model: ${providerModel}`, ...(providerReasoning !== undefined ? [`Reasoning effort: ${providerReasoning}`] : [])];
    await writeFile(reportPath, `${report.markdown}\n\n---\n\n## Provider\n\n${artifactProvider.map((line) => `- ${line}`).join("\n")}${artifactUsage}`, { encoding: "utf8", mode: 0o600 });
    const p1 = report.findings.filter((finding) => finding.severity === "P1").length;
    const p2 = report.findings.filter((finding) => finding.severity === "P2").length;
    const p3 = report.findings.filter((finding) => finding.severity === "P3").length;
    const passed = report.standards.filter((standard) => standard.status === "PASS").length;
    const failed = report.standards.filter((standard) => standard.status === "FAIL").length;
    const notApplicable = report.standards.filter((standard) => standard.status === "N/A").length;
    const verdict = report.findings.length > 0 || failed > 0 ? "CHANGES RECOMMENDED" : "NO ISSUES FOUND";
    const findingSummary = report.findings.length === 0
      ? "- No actionable findings."
      : report.findings.map((finding) => `- **${finding.severity} ${finding.title}** - ${finding.location}`).join("\n");
    await writeFile(
      summaryPath,
      `# DevX Crew review summary\n\n**Execution:** PASS - reviewer finished successfully  \n**Verdict:** ${verdict}  \n**Findings:** ${p1} P1 · ${p2} P2 · ${p3} P3  \n**Standards:** ${passed} PASS · ${failed} FAIL · ${notApplicable} N/A\n\n## Findings\n\n${findingSummary}\n\n## Artifacts\n\n- Full report: ${reportPath}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    reporter.document(report);
    reporter.artifact(summaryPath, "Summary");
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
