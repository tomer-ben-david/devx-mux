import { spawnSync } from "node:child_process";

export function executableName(command: string): string {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
  }
  return command;
}

export function run(command: string, arguments_: readonly string[]): void {
  const result = spawnSync(executableName(command), arguments_, {
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.signal !== null) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

