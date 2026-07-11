import { spawn } from "node:child_process";

export function runStreamingProvider(
  command: string,
  arguments_: readonly string[],
  providerName: string,
  onOutput?: (chunk: string) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, arguments_, {
      stdio: ["inherit", "pipe", "pipe"],
    });

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
        reject(new Error(`${providerName} review terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

