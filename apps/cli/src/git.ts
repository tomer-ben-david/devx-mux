import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(repositoryPath: string, args: readonly string[]): Promise<string> {
  return (await gitRaw(repositoryPath, args)).trim();
}

async function gitRaw(repositoryPath: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
  });
  return stdout;
}

export async function resolveRepositoryPath(inputPath: string): Promise<string> {
  return git(path.resolve(inputPath), ["rev-parse", "--show-toplevel"]);
}

export interface LocalChangeSummary {
  readonly files: number;
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
}

export function summarizePorcelainStatus(status: string): LocalChangeSummary {
  const normalized = status.replace(/\r?\n$/, "");
  const lines = normalized.length === 0 ? [] : normalized.split(/\r?\n/);

  return {
    files: lines.length,
    staged: lines.filter((line) => line[0] !== " " && line[0] !== "?").length,
    modified: lines.filter((line) => line[1] !== " " && line[1] !== "?").length,
    untracked: lines.filter((line) => line.startsWith("??")).length,
  };
}

export async function inspectLocalChanges(repositoryPath: string): Promise<LocalChangeSummary> {
  return summarizePorcelainStatus(await gitRaw(repositoryPath, ["status", "--porcelain"]));
}

export async function discoverRepositoryInstructions(repositoryPath: string): Promise<string[]> {
  const tracked = await git(repositoryPath, ["ls-files"]);
  const untracked = await git(repositoryPath, ["ls-files", "--others", "--exclude-standard"]);
  return instructionPathsFromGitFiles(repositoryPath, [tracked, untracked].filter(Boolean).join("\n"));
}

export function instructionPathsFromGitFiles(repositoryPath: string, files: string): string[] {
  return files
    .split(/\r?\n/)
    .filter((file) => file.length > 0)
    .filter((file) => {
      const name = path.basename(file).toLowerCase();
      return name === "agents.md" || name === "claude.md";
    })
    .sort()
    .map((file) => path.join(repositoryPath, file));
}
