import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
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

export async function discoverRepositoryInstructions(repositoryPath: string): Promise<string[]> {
  const candidates = ["AGENTS.md", "CLAUDE.md"];
  const discovered: string[] = [];

  for (const candidate of candidates) {
    const candidatePath = path.join(repositoryPath, candidate);
    try {
      await access(candidatePath);
      discovered.push(candidatePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return discovered;
}

