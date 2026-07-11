import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function commandVersion(command: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(command, ["--version"], { encoding: "utf8" });
  return (stdout || stderr).trim();
}

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
  signal?: AbortSignal,
): Promise<JsonLinesExecution> {
  return new Promise((resolve, reject) => {
    const detached = process.platform !== "win32";
    const childProcess = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"], detached });
    let stdoutBuffer = "";
    let stderrText = "";
    let structuredOutputError: Error | undefined;
    const terminate = (): void => {
      if (childProcess.pid === undefined) return;
      try {
        if (detached) process.kill(-childProcess.pid, "SIGTERM");
        else childProcess.kill("SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const abort = (): void => terminate();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true) terminate();

    const consumeLine = (line: string) => {
      if (line.trim().length === 0) return;
      try {
        onJsonLine({ source: "stdout", value: JSON.parse(line) });
      } catch (error) {
        throw new Error(`${providerName} emitted malformed structured output: ${line.slice(0, 160)}`, { cause: error });
      }
    };

    const consumeStdout = (chunk: Buffer) => {
      const lines = (stdoutBuffer + chunk.toString("utf8")).split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      try {
        for (const line of lines) consumeLine(line);
      } catch (error) {
        structuredOutputError = error instanceof Error ? error : new Error(String(error));
        terminate();
      }
    };

    childProcess.stdout.on("data", consumeStdout);
    childProcess.stderr.on("data", (chunk: Buffer) => { stderrText += chunk.toString("utf8"); });
    childProcess.on("error", reject);
    childProcess.on("close", (code, terminationSignal) => {
      signal?.removeEventListener("abort", abort);
      if (structuredOutputError !== undefined) {
        reject(structuredOutputError);
        return;
      }
      if (terminationSignal !== null) {
        reject(new Error(`${providerName} review terminated by signal ${terminationSignal}`));
        return;
      }
      try {
        consumeLine(stdoutBuffer);
      } catch (error) {
        reject(error);
        return;
      }
      resolve({ exitCode: code ?? 1, stderr: stderrText.trim() });
    });
  });
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
