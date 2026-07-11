import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(repositoryPath: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
  });
  return stdout.trim();
}

export async function resolveRepositoryPath(inputPath: string): Promise<string> {
  return git(path.resolve(inputPath), ["rev-parse", "--show-toplevel"]);
}
