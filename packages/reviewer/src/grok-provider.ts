import { spawn } from "node:child_process";
import type { ReviewProvider } from "./types.js";

export class GrokReviewProvider implements ReviewProvider {
  readonly name = "grok";

  review(prompt: string, repositoryPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const process = spawn(
        "grok",
        ["--cwd", repositoryPath, "--single", prompt, "--no-plan", "--no-subagents", "--no-ask-user"],
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

