#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexReviewProvider, GrokReviewProvider, buildReviewPrompt, type ReviewProgress, type ReviewProvider } from "@devx-mux/reviewer";
import { createParallelReviewDashboard, TerminalReporter, type ReviewPanelId } from "@devx-mux/terminal-ui";
import { helpText, parseReviewArguments, reviewHelpText } from "./arguments.js";
import { resolveRepositoryPath } from "./git.js";
import { persistCombinedReview, persistRawReview, type ProviderIdentity } from "./review-artifacts.js";

const STANDARDS_URL = "https://github.com/tomer-ben-david/devx-coding-standards";

function compactNumber(value: number): string {
  if (value < 1_000) return value.toLocaleString();
  if (value < 1_000_000) return `${Number((value / 1_000).toFixed(value < 10_000 ? 1 : 0))}K`;
  return `${Number((value / 1_000_000).toFixed(1))}M`;
}

async function providerIdentity(id: ReviewPanelId, provider: ReviewProvider, repositoryPath: string): Promise<ProviderIdentity> {
  const [version, configuration] = await Promise.all([provider.version(), provider.configuration?.(repositoryPath)]);
  return {
    label: id === "codex" ? "Codex" : "Grok",
    version,
    model: configuration?.model ?? "provider default",
    ...(configuration?.reasoningEffort === undefined ? {} : { reasoning: configuration.reasoningEffort }),
  };
}

async function runBothProviders(
  prompt: string,
  repositoryPath: string,
  scopeKind: string,
  scopeLabel: string,
  codexReasoning: "low" | "medium" | "high" | "xhigh",
  grokReasoning: "low" | "medium" | "high",
  interactive: boolean,
): Promise<number> {
  const providers = {
    codex: new CodexReviewProvider(codexReasoning),
    grok: new GrokReviewProvider(grokReasoning),
  } as const;
  const identities = {
    codex: await providerIdentity("codex", providers.codex, repositoryPath),
    grok: await providerIdentity("grok", providers.grok, repositoryPath),
  };
  const controller = new AbortController();
  const cancel = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };
  process.on("SIGINT", cancel);
  const dashboard = interactive
    ? await createParallelReviewDashboard(path.basename(repositoryPath), scopeLabel, cancel)
    : undefined;
  const lastHeadlessStatus: Partial<Record<ReviewPanelId, string>> = {};
  for (const id of ["codex", "grok"] as const) {
    const identity = identities[id];
    dashboard?.configure(id, `${identity.version} · ${identity.model}${identity.reasoning === undefined ? "" : ` · ${identity.reasoning} reasoning`}`);
  }
  const runProvider = async (id: ReviewPanelId) => {
    const progress = (update: ReviewProgress) => {
      dashboard?.update(id, update);
      if (dashboard === undefined && lastHeadlessStatus[id] !== update.status) {
        lastHeadlessStatus[id] = update.status;
        process.stderr.write(`[${identities[id].label}] ${update.status}\n`);
      }
    };
    const execution = await providers[id].review(prompt, repositoryPath, progress, controller.signal);
    if (execution.exitCode !== 0) throw new Error(`${identities[id].label}: ${execution.error ?? `exited with status ${execution.exitCode}`}`);
    if (execution.finalText.trim().length === 0) throw new Error(`${identities[id].label}: returned no final review`);
    const rawPath = await persistRawReview(repositoryPath, scopeKind, identities[id].label, execution.finalText);
    dashboard?.complete(id);
    return { markdown: execution.finalText, reportPath: rawPath };
  };

  const settled = await Promise.allSettled([runProvider("codex"), runProvider("grok")]);
  process.off("SIGINT", cancel);
  const ids = ["codex", "grok"] as const;
  settled.forEach((result, index) => {
    if (result.status === "rejected") dashboard?.complete(ids[index] ?? "codex", result.reason instanceof Error ? result.reason.message : String(result.reason));
  });
  dashboard?.close();
  if (controller.signal.aborted) {
    process.stderr.write("\nReview cancelled. Codex and Grok were stopped.\n");
    return 130;
  }
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    const completed = settled.flatMap((result, index) => result.status === "fulfilled" ? [`${identities[ids[index] ?? "codex"].label} report ${result.value.reportPath}`] : []);
    process.stderr.write(`DevX Mux: parallel review incomplete. ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}\n${completed.length === 0 ? "" : `${completed.join("\n")}\n`}`);
    return 1;
  }
  const codex = settled[0].status === "fulfilled" ? settled[0].value : undefined;
  const grok = settled[1].status === "fulfilled" ? settled[1].value : undefined;
  if (codex === undefined || grok === undefined) return 1;
  const combined = await persistCombinedReview(repositoryPath, scopeKind, codex.reportPath, grok.reportPath, codex.markdown, grok.markdown);
  if (interactive) {
    process.stdout.write(`\n✓ Both reviewers completed\nCodex report ${codex.reportPath}\nGrok report ${grok.reportPath}\nFull report ${combined.path}\n`);
  } else {
    process.stdout.write(`${combined.markdown}\n`);
  }
  return 0;
}

async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rawCommandArguments] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(helpText());
    return 0;
  }
  if (command !== "review" && command !== "multireview") {
    throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
  }
  if (rawCommandArguments.includes("--help") || rawCommandArguments.includes("-h")) {
    process.stdout.write(reviewHelpText(command));
    return 0;
  }
  if (command === "multireview" && rawCommandArguments.includes("--provider")) {
    throw new Error("multireview already selects Codex and Grok; remove --provider.");
  }
  const commandArguments = command === "multireview"
    ? [...rawCommandArguments, "--provider", "both"]
    : rawCommandArguments;

  const options = parseReviewArguments(commandArguments);
  const interactive = options.outputFormat === "tui"
    || (options.outputFormat === "auto" && process.stdout.isTTY === true);
  if (options.outputFormat === "tui" && process.stdout.isTTY !== true) {
    throw new Error("--format tui requires an interactive terminal.");
  }
  const reporter = interactive
    ? new TerminalReporter()
    : new TerminalReporter({ output: process.stderr, color: false, animated: false });
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
    ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
  };
  const prompt = buildReviewPrompt(request);

  if (options.dryRun) {
    process.stdout.write(prompt);
    return 0;
  }

  if (options.provider === "both") {
    const sharedReasoning = options.reasoningEffort === "low" ? "low" : options.reasoningEffort === "medium" ? "medium" : "high";
    return runBothProviders(
      prompt,
      repositoryPath,
      options.scope.kind,
      scopeLabel,
      options.codexReasoningEffort ?? sharedReasoning,
      options.grokReasoningEffort ?? sharedReasoning,
      interactive,
    );
  }

  const provider = options.provider === "grok"
    ? new GrokReviewProvider(options.reasoningEffort === "low" ? "low" : options.reasoningEffort === "medium" ? "medium" : "high")
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
    const reportPath = await persistRawReview(repositoryPath, options.scope.kind, providerLabel, execution.finalText);
    if (interactive) {
      reporter.providerChunk(`${execution.finalText}\n`);
      reporter.flushProvider();
      reporter.artifact(reportPath);
    } else {
      process.stdout.write(`${execution.finalText}\n`);
      process.stderr.write(`Full report ${reportPath}\n`);
    }
    if (execution.usage !== undefined) {
      reporter.usage([
        ...(execution.usage.inputTokens !== undefined ? [`${compactNumber(execution.usage.inputTokens)} in`] : []),
        ...(execution.usage.cachedInputTokens !== undefined ? [`${compactNumber(execution.usage.cachedInputTokens)} cached`] : []),
        ...(execution.usage.outputTokens !== undefined ? [`${compactNumber(execution.usage.outputTokens)} out`] : []),
        ...(execution.usage.reasoningTokens !== undefined ? [`${compactNumber(execution.usage.reasoningTokens)} reasoning`] : []),
        "quota remaining: unavailable",
      ]);
    }
    if (interactive) reporter.result("provider output saved");
    return 0;
  } catch (error) {
    reporter.failure(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function runWithManagedBun(argv: readonly string[]): number | undefined {
  const providerIndex = argv.indexOf("--provider");
  const parallel = argv[0] === "multireview" || argv[providerIndex + 1] === "both";
  const formatArgument = argv.find((argument) => argument.startsWith("--format="));
  const formatIndex = argv.indexOf("--format");
  const format = formatArgument?.slice("--format=".length) ?? (formatIndex >= 0 ? argv[formatIndex + 1] : undefined);
  const wantsDashboard = format === "tui" || (format !== "markdown" && process.stdout.isTTY === true);
  if (!wantsDashboard || !parallel || "Bun" in globalThis) return undefined;
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const binary = process.platform === "win32" ? "bun.exe" : "bun";
  const bun = [
    path.resolve(directory, "..", "node_modules", ".bin", binary),
    path.resolve(directory, "..", "..", "node_modules", ".bin", binary),
    path.resolve(directory, "..", "..", "..", "node_modules", ".bin", binary),
  ].find(existsSync);
  if (bun === undefined) throw new Error("The managed Bun runtime is missing. Run ./mux.sh setup.");
  const result = spawnSync(bun, [fileURLToPath(import.meta.url), ...argv], { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  return result.status ?? (result.signal === null ? 1 : 130);
}

const argv = process.argv.slice(2);
const managedBunExit = runWithManagedBun(argv);

(managedBunExit === undefined ? run(argv) : Promise.resolve(managedBunExit))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mux: ${message}\n`);
    process.exitCode = 1;
  });
