import { commandVersion, recordValue, runJsonLinesProvider } from "./json-lines-provider.js";
import type { ReviewExecutionResult, ReviewProgress, ReviewProvider, ReviewProviderConfiguration } from "./types.js";

export function grokReviewArguments(prompt: string, repositoryPath: string, reasoningEffort: "low" | "medium" | "high" = "high"): string[] {
  return [
    "--cwd",
    repositoryPath,
    "--single",
    prompt,
    "--output-format",
    "streaming-json",
    "--reasoning-effort",
    reasoningEffort,
    "--check",
    "--no-ask-user",
  ];
}

export class GrokReviewProvider implements ReviewProvider {
  readonly name = "grok";

  constructor(private readonly reasoningEffort: "low" | "medium" | "high" = "high") {}

  version(): Promise<string> {
    return commandVersion("grok");
  }

  async configuration(): Promise<ReviewProviderConfiguration> {
    return { reasoningEffort: this.reasoningEffort };
  }

  async review(
    prompt: string,
    repositoryPath: string,
    onProgress?: (update: ReviewProgress) => void,
    signal?: AbortSignal,
  ): Promise<ReviewExecutionResult> {
    let finalText = "";
    let thoughtCount = 0;
    let error: string | undefined;
    const execution = await runJsonLinesProvider(
      "grok",
      grokReviewArguments(prompt, repositoryPath, this.reasoningEffort),
      "Grok",
      ({ source, value }) => {
        if (source !== "stdout") return;
        const event = recordValue(value);
        if (event?.type === "text" && typeof event.data === "string") {
          finalText += event.data;
          onProgress?.({ status: "Writing the review", kind: "message", text: event.data });
        }
        if (event?.type === "thought") {
          thoughtCount += 1;
          onProgress?.({
            status: thoughtCount < 3 ? "Inspecting the repository" : "Checking standards and risks",
            kind: "reasoning",
            ...(typeof event.data === "string" ? { text: event.data } : {}),
          });
        }
        if (event?.type === "error" && typeof event.message === "string") error = event.message;
      },
      signal,
    );
    return {
      exitCode: execution.exitCode,
      finalText,
      ...(execution.exitCode !== 0 ? { error: error ?? (execution.stderr || "Grok review failed") } : {}),
    };
  }
}
