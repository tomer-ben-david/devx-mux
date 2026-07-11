import { spawn } from "node:child_process";

export interface JsonLine {
  readonly source: "stdout" | "stderr";
  readonly value: unknown;
}

export interface JsonLinesExecution {
  readonly exitCode: number;
  readonly stderr: string;
}

export function runJsonLinesProvider(
  command: string,
  arguments_: readonly string[],
  providerName: string,
  onJsonLine: (line: JsonLine) => void,
): Promise<JsonLinesExecution> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
    let stdoutBuffer = "";
    let stderrText = "";

    const consumeStdout = (chunk: Buffer) => {
      const lines = (stdoutBuffer + chunk.toString("utf8")).split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        try {
          onJsonLine({ source: "stdout", value: JSON.parse(line) });
        } catch {
          // Structured providers may emit a non-JSON notice before their event stream.
        }
      }
    };

    childProcess.stdout.on("data", consumeStdout);
    childProcess.stderr.on("data", (chunk: Buffer) => { stderrText += chunk.toString("utf8"); });
    childProcess.on("error", reject);
    childProcess.on("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`${providerName} review terminated by signal ${signal}`));
        return;
      }
      resolve({ exitCode: code ?? 1, stderr: stderrText.trim() });
    });
  });
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
