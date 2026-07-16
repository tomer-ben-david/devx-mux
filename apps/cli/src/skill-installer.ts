import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_SKILL_NAMES = [
  "mux-orchestrate",
  "mux-chatgpt-review",
  "mux-multireview",
  "mux-pr-description",
  "mux-staged-review",
] as const;

const LEGACY_PUBLIC_SKILL_NAMES = ["devx-mux", "pr-title-description", "staged-pr-review"] as const;

interface SkillLink {
  readonly destination: string;
  readonly source: string;
  readonly state: "current" | "replace";
}

interface LegacySkillPath {
  readonly destination: string;
  readonly exists: boolean;
}

interface SkillInstallPlan {
  readonly canonicalLinks: readonly SkillLink[];
  readonly legacyPaths: readonly LegacySkillPath[];
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
  const sourceRoot = candidates.find((candidate) => existsSync(path.join(candidate, "mux-orchestrate", "SKILL.md")));
  if (sourceRoot === undefined) {
    throw new Error("Packaged DevX Mux skills are missing. Reinstall devx-mux and run mux setup again.");
  }
  return sourceRoot;
}

function pathsOverlap(left: string, right: string): boolean {
  const relative = path.relative(left, right);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveThroughExistingAncestor(candidate: string): string {
  const suffix: string[] = [];
  let existingAncestor = path.resolve(candidate);
  while (lstatSync(existingAncestor, { throwIfNoEntry: false }) === undefined) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) break;
    suffix.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }
  return path.join(realpathSync(existingAncestor), ...suffix);
}

function canonicalMutationPath(destination: string): string {
  return path.join(
    resolveThroughExistingAncestor(path.dirname(destination)),
    path.basename(destination),
  );
}

function validateMutationOutsideSourceTree(destination: string, canonicalSourceRoot: string): void {
  const canonicalDestination = canonicalMutationPath(destination);
  if (
    pathsOverlap(canonicalSourceRoot, canonicalDestination)
    || pathsOverlap(canonicalDestination, canonicalSourceRoot)
  ) {
    throw new Error(
      `Refusing to mutate a skill path that overlaps the source tree: ${destination} <-> ${canonicalSourceRoot}`,
    );
  }
}

function inspectSkillLink(
  skillRoot: string,
  skillsSourceRoot: string,
  canonicalSourceRoot: string,
  skillName: string,
): SkillLink {
  const source = path.resolve(skillsSourceRoot, skillName);
  if (!existsSync(path.join(source, "SKILL.md"))) {
    throw new Error(`Packaged skill is missing: ${source}`);
  }
  const destination = path.resolve(skillRoot, skillName);
  validateMutationOutsideSourceTree(destination, canonicalSourceRoot);
  const stat = lstatSync(destination, { throwIfNoEntry: false });
  const linkedSource = stat?.isSymbolicLink() ? path.resolve(skillRoot, readlinkSync(destination)) : undefined;
  return { destination, source, state: linkedSource === source ? "current" : "replace" };
}

function inspectLegacySkillPath(skillRoot: string, canonicalSourceRoot: string, skillName: string): LegacySkillPath {
  const destination = path.resolve(skillRoot, skillName);
  validateMutationOutsideSourceTree(destination, canonicalSourceRoot);
  return { destination, exists: lstatSync(destination, { throwIfNoEntry: false }) !== undefined };
}

function createInstallPlan(skillRoots: readonly string[], skillsSourceRoot: string): SkillInstallPlan {
  if (!existsSync(skillsSourceRoot)) {
    throw new Error(`Packaged skills directory is missing: ${skillsSourceRoot}`);
  }
  const canonicalSourceRoot = realpathSync(skillsSourceRoot);
  const canonicalLinks = skillRoots.flatMap((root) =>
    PUBLIC_SKILL_NAMES.map((name) => inspectSkillLink(root, skillsSourceRoot, canonicalSourceRoot, name)),
  );
  const legacyPaths = skillRoots.flatMap((root) =>
    LEGACY_PUBLIC_SKILL_NAMES.map((name) => inspectLegacySkillPath(root, canonicalSourceRoot, name)),
  );
  return { canonicalLinks, legacyPaths };
}

function installSkillLink(link: SkillLink): void {
  if (link.state === "current") return;
  mkdirSync(path.dirname(link.destination), { recursive: true });
  rmSync(link.destination, { recursive: true, force: true });
  symlinkSync(link.source, link.destination, process.platform === "win32" ? "junction" : "dir");
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
  const { canonicalLinks, legacyPaths } = createInstallPlan(skillRoots, skillsSourceRoot);

  canonicalLinks.forEach(installSkillLink);
  legacyPaths.forEach((legacyPath) => rmSync(legacyPath.destination, { recursive: true, force: true }));

  legacyPaths
    .filter((legacyPath) => legacyPath.exists)
    .forEach((legacyPath) => output.write(`Removed legacy skill: ${legacyPath.destination}\n`));
  canonicalLinks.forEach((link) => {
    if (link.state === "current") {
      output.write(`Skill already linked: ${link.destination}\n`);
    } else {
      output.write(`Linked skill: ${link.destination} -> ${link.source}\n`);
    }
  });
}
