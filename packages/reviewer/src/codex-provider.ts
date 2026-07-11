import { runStreamingProvider } from "./streaming-provider.js";
import type { ReviewProvider } from "./types.js";

export function codexReviewArguments(prompt: string, repositoryPath: string): string[] {
  return [
    "exec",
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

  review(prompt: string, repositoryPath: string, onOutput?: (chunk: string) => void): Promise<number> {
    return runStreamingProvider(
      "codex",
      codexReviewArguments(prompt, repositoryPath),
      "Codex",
      onOutput,
    );
  }
}

