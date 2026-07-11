import { recordValue, runJsonLinesProvider } from "./json-lines-provider.js";
import type { ReviewExecutionResult, ReviewProvider } from "./types.js";

export function grokReviewArguments(prompt: string, repositoryPath: string): string[] {
  return [
    "--cwd",
    repositoryPath,
    "--single",
    prompt,
    "--output-format",
    "streaming-json",
    "--reasoning-effort",
    "high",
    "--check",
    "--no-plan",
    "--no-ask-user",
  ];
}

export class GrokReviewProvider implements ReviewProvider {
  readonly name = "grok";

  async review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (detail: string) => void,
  ): Promise<ReviewExecutionResult> {
    let finalText = "";
    let thoughtCount = 0;
    let error: string | undefined;
    const execution = await runJsonLinesProvider(
      "grok",
      grokReviewArguments(prompt, repositoryPath),
      "Grok",
      ({ source, value }) => {
        if (source !== "stdout") return;
        const event = recordValue(value);
        if (event?.type === "text" && typeof event.data === "string") finalText += event.data;
        if (event?.type === "thought") {
          thoughtCount += 1;
          onProgress?.(thoughtCount < 3 ? "Inspecting the repository" : "Checking standards and risks");
        }
        if (event?.type === "error" && typeof event.message === "string") error = event.message;
      },
    );
    return {
      exitCode: execution.exitCode,
      finalText,
      ...(execution.exitCode !== 0 ? { error: error ?? (execution.stderr || "Grok review failed") } : {}),
    };
  }
}
