import { spawn } from "node:child_process";
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

  review(prompt: string, repositoryPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const process = spawn(
        "grok",
        grokReviewArguments(prompt, repositoryPath),
        { stdio: "inherit" },
      );

      process.on("error", reject);
      process.on("exit", (code, signal) => {
        if (signal !== null) {
          reject(new Error(`Grok review terminated by signal ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  }
}
