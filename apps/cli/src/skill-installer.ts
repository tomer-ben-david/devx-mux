import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_SKILL_NAMES = [
  "devx-mux",
  "mux-multireview",
  "mux-orchestrate",
  "pr-title-description",
  "staged-pr-review",
] as const;

interface SkillLink {
  readonly destination: string;
  readonly source: string;
  readonly state: "missing" | "current" | "stale";
}

interface InstallPublicSkillsOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly skillsSourceRoot?: string;
  readonly output?: Pick<NodeJS.WriteStream, "write">;
}

function resolveSkillsSourceRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "..", "skills"),
    path.resolve(moduleDirectory, "..", "..", "..", "skills"),
  ];
  const sourceRoot = candidates.find((candidate) => existsSync(path.join(candidate, "devx-mux", "SKILL.md")));
  if (sourceRoot === undefined) {
    throw new Error("Packaged DevX Mux skills are missing. Reinstall devx-mux and run mux setup again.");
  }
  return sourceRoot;
}

function inspectSkillLink(skillRoot: string, skillsSourceRoot: string, skillName: string): SkillLink {
  const source = path.join(skillsSourceRoot, skillName);
  if (!existsSync(path.join(source, "SKILL.md"))) {
    throw new Error(`Packaged skill is missing: ${source}`);
  }
  const destination = path.join(skillRoot, skillName);
  const stat = lstatSync(destination, { throwIfNoEntry: false });
  if (!stat) {
    return { destination, source, state: "missing" };
  }
  if (!stat.isSymbolicLink()) {
    throw new Error(`Refusing to replace existing file or directory: ${destination}`);
  }
  const linkedSource = path.resolve(skillRoot, readlinkSync(destination));
  return { destination, source, state: linkedSource === source ? "current" : "stale" };
}

function installSkillLink(link: SkillLink, output: Pick<NodeJS.WriteStream, "write">): void {
  if (link.state === "current") {
    output.write(`Skill already linked: ${link.destination}\n`);
    return;
  }
  mkdirSync(path.dirname(link.destination), { recursive: true });
  if (link.state === "stale") {
    unlinkSync(link.destination);
  }
  symlinkSync(link.source, link.destination, process.platform === "win32" ? "junction" : "dir");
  output.write(`Linked skill: ${link.destination} -> ${link.source}\n`);
}

export function installPublicSkills(options: InstallPublicSkillsOptions = {}): void {
  const environment = options.environment ?? process.env;
  const skillsSourceRoot = options.skillsSourceRoot ?? resolveSkillsSourceRoot();
  const output = options.output ?? process.stdout;
  const skillRoots = [
    path.join(environment.CODEX_HOME ?? path.join(homedir(), ".codex"), "skills"),
    path.join(environment.CLAUDE_HOME ?? path.join(homedir(), ".claude"), "skills"),
    path.join(environment.AGENTS_HOME ?? path.join(homedir(), ".agents"), "skills"),
  ];
  const links = skillRoots.flatMap((root) =>
    PUBLIC_SKILL_NAMES.map((name) => inspectSkillLink(root, skillsSourceRoot, name)),
  );
  links.forEach((link) => installSkillLink(link, output));
}
