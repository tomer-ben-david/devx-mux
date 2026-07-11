import { recordValue, runJsonLinesProvider } from "./json-lines-provider.js";
import type { ReviewExecutionResult, ReviewProvider } from "./types.js";

export function codexReviewArguments(prompt: string, repositoryPath: string): string[] {
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
    prompt,
  ];
}

export class CodexReviewProvider implements ReviewProvider {
  readonly name = "codex";

  async review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (detail: string) => void,
  ): Promise<ReviewExecutionResult> {
    let finalText = "";
    let commandCount = 0;
    let error: string | undefined;
    const execution = await runJsonLinesProvider(
      "codex",
      codexReviewArguments(prompt, repositoryPath),
      "Codex",
      ({ source, value }) => {
        if (source !== "stdout") return;
        const event = recordValue(value);
        const item = recordValue(event?.item);
        if (event?.type === "thread.started") onProgress?.("Understanding the review target");
        if (item?.type === "command_execution" && event?.type === "item.started") {
          commandCount += 1;
          onProgress?.(commandCount < 3 ? "Inspecting the repository" : "Checking standards and risks");
        }
        if (item?.type === "agent_message" && typeof item.text === "string") finalText = item.text;
        if (item?.type === "error" && typeof item.message === "string") error = item.message;
        if (event?.type === "turn.completed") onProgress?.("Finalizing the assessment");
      },
    );
    return {
      exitCode: execution.exitCode,
      finalText,
      ...(execution.exitCode !== 0 ? { error: error ?? (execution.stderr || "Codex review failed") } : {}),
    };
  }
}
