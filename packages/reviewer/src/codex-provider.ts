import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandVersion, recordValue, runJsonLinesProvider } from "./json-lines-provider.js";
import type { ReviewExecutionResult, ReviewProgress, ReviewProvider, ReviewProviderConfiguration, ReviewUsage } from "./types.js";

export function codexReviewArguments(prompt: string, repositoryPath: string, reasoningEffort?: "medium" | "high" | "xhigh"): string[] {
  return [
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    repositoryPath,
    ...(reasoningEffort !== undefined ? ["-c", `model_reasoning_effort=\"${reasoningEffort}\"`] : []),
    prompt,
  ];
}

export class CodexReviewProvider implements ReviewProvider {
  readonly name = "codex";

  constructor(private readonly reasoningEffort?: "medium" | "high" | "xhigh") {}

  version(): Promise<string> {
    return commandVersion("codex");
  }

  async configuration(repositoryPath: string): Promise<ReviewProviderConfiguration> {
    const configuration: { model?: string; reasoningEffort?: string } = {};
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
    for (const path of [join(codexHome, "config.toml"), join(repositoryPath, ".codex", "config.toml")]) {
      try {
        const topLevel = (await readFile(path, "utf8")).split(/^\s*\[/m)[0] ?? "";
        const model = topLevel.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1];
        const reasoningEffort = topLevel.match(/^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m)?.[1];
        if (model !== undefined) configuration.model = model;
        if (reasoningEffort !== undefined) configuration.reasoningEffort = reasoningEffort;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (this.reasoningEffort !== undefined) configuration.reasoningEffort = this.reasoningEffort;
    return configuration;
  }

  async review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (update: ReviewProgress) => void,
  ): Promise<ReviewExecutionResult> {
    let finalText = "";
    let commandCount = 0;
    let error: string | undefined;
    let usage: ReviewUsage | undefined;
    const execution = await runJsonLinesProvider(
      "codex",
      codexReviewArguments(prompt, repositoryPath, this.reasoningEffort),
      "Codex",
      ({ source, value }) => {
        if (source !== "stdout") return;
        const event = recordValue(value);
        const item = recordValue(event?.item);
        if (event?.type === "thread.started") onProgress?.({ status: "Understanding the review target" });
        if (item?.type === "command_execution" && event?.type === "item.started") {
          commandCount += 1;
          onProgress?.({
            status: commandCount < 3 ? "Inspecting the repository" : "Checking standards and risks",
            kind: "tool",
            ...(typeof item.command === "string" ? { text: item.command } : {}),
          });
        }
        if (item?.type === "reasoning" && typeof item.text === "string") {
          onProgress?.({ status: "Reasoning about the evidence", kind: "reasoning", text: item.text });
        }
        if (item?.type === "agent_message" && typeof item.text === "string") {
          finalText += `${finalText.length > 0 ? "\n" : ""}${item.text}`;
          onProgress?.({ status: "Writing the review", kind: "message", text: item.text });
        }
        if (item?.type === "error" && typeof item.message === "string") error = item.message;
        if (event?.type === "turn.completed") {
          const rawUsage = recordValue(event.usage);
          usage = {
            ...(typeof rawUsage?.input_tokens === "number" ? { inputTokens: rawUsage.input_tokens } : {}),
            ...(typeof rawUsage?.cached_input_tokens === "number" ? { cachedInputTokens: rawUsage.cached_input_tokens } : {}),
            ...(typeof rawUsage?.output_tokens === "number" ? { outputTokens: rawUsage.output_tokens } : {}),
            ...(typeof rawUsage?.reasoning_output_tokens === "number" ? { reasoningTokens: rawUsage.reasoning_output_tokens } : {}),
          };
          onProgress?.({ status: "Finalizing the assessment" });
        }
      },
    );
    return {
      exitCode: execution.exitCode,
      finalText,
      ...(usage !== undefined ? { usage } : {}),
      ...(execution.exitCode !== 0 ? { error: error ?? (execution.stderr || "Codex review failed") } : {}),
    };
  }
}
