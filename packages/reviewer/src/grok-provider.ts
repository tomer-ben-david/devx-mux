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

  review(prompt: string, repositoryPath: string, onOutput?: (chunk: string) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(
        "grok",
        grokReviewArguments(prompt, repositoryPath),
        { stdio: ["inherit", "pipe", "pipe"] },
      );

      childProcess.stdout.on("data", (chunk: Buffer) => {
        if (onOutput === undefined) {
          process.stdout.write(chunk);
        } else {
          onOutput(chunk.toString("utf8"));
        }
      });
      childProcess.stderr.on("data", (chunk: Buffer) => {
        if (onOutput === undefined) {
          process.stderr.write(chunk);
        } else {
          onOutput(chunk.toString("utf8"));
        }
      });
      childProcess.on("error", reject);
      childProcess.on("exit", (code, signal) => {
        if (signal !== null) {
          reject(new Error(`Grok review terminated by signal ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
  }
}
