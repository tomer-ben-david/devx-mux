import { runStreamingProvider } from "./streaming-provider.js";
import type { ReviewProvider } from "./types.js";

export function grokReviewArguments(prompt: string, repositoryPath: string): string[] {
  return [
    "--cwd",
    repositoryPath,
    "--single",
    prompt,
    "--reasoning-effort",
    "high",
    "--check",
    "--no-plan",
    "--no-ask-user",
  ];
}

export class GrokReviewProvider implements ReviewProvider {
  readonly name = "grok";

  review(prompt: string, repositoryPath: string, onOutput?: (chunk: string) => void): Promise<number> {
    return runStreamingProvider("grok", grokReviewArguments(prompt, repositoryPath), "Grok", onOutput);
  }
}
