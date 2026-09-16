import { existsSync, lstatSync, mkdirSync, readlinkSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_SKILL_NAMES = [
  "mux-ai-engineer-workflow",
  "mux-chatgpt-review",
  "mux-director",
  "mux-multireview",
  "mux-pr-description",
  "mux-staged-review",
] as const;

const LEGACY_PUBLIC_SKILL_NAMES = ["devx-mux", "mux-orchestrate", "pr-title-description", "staged-pr-review"] as const;

/**
 * Global agent instruction files live in `agent-config/` and are symlinked into
 * the user's Codex/Claude homes so they are version-controlled in this repo
 * instead of living as bare, unsynchronized dotfiles.
 *
 * The folder layout IS the mapping - no per-file table to maintain:
 *   agent-config/<home>/<relative-path>  ->  ~/<.home>/<relative-path>
 * where <home> is `codex` or `claude`. Drop a new file in
 * `agent-config/codex/foo.md` and it is linked automatically on next install.
 */
const AGENT_CONFIG_HOME_DIRS = ["codex", "claude"] as const;
type AgentConfigHomeDir = (typeof AGENT_CONFIG_HOME_DIRS)[number];

type LinkType = "dir" | "file";

interface SkillLink {
  readonly destination: string;
  readonly source: string;
  readonly state: "current" | "replace";
  readonly type: LinkType;
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
  readonly agentConfigSourceRoot?: string;
  readonly output?: Pick<NodeJS.WriteStream, "write">;
}

function resolveSkillsSourceRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "..", "skills"),
    path.resolve(moduleDirectory, "..", "..", "..", "skills"),
  ];
  const sourceRoot = candidates.find((candidate) => existsSync(path.join(candidate, "mux-director", "SKILL.md")));
  if (sourceRoot === undefined) {
    throw new Error("Packaged DevX Mux skills are missing. Reinstall devx-mux and run mux setup again.");
  }
  return sourceRoot;
}

function resolveAgentConfigSourceRoot(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDirectory, "..", "agent-config"),
    path.resolve(moduleDirectory, "..", "..", "..", "agent-config"),
  ];
  const sourceRoot = candidates.find((candidate) => existsSync(path.join(candidate, "codex", "AGENTS.md")));
  if (sourceRoot === undefined) {
    throw new Error("Packaged DevX Mux agent-config is missing. Reinstall devx-mux and run mux setup again.");
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

function normalizeSkillRoots(skillRoots: readonly string[]): readonly string[] {
  const uniqueRoots = [...new Set(skillRoots.map(resolveThroughExistingAncestor))];
  for (const [index, root] of uniqueRoots.entries()) {
    for (const otherRoot of uniqueRoots.slice(index + 1)) {
      if (pathsOverlap(root, otherRoot) || pathsOverlap(otherRoot, root)) {
        throw new Error(`Configured skill roots must not be nested: ${root} <-> ${otherRoot}`);
      }
    }
  }
  return uniqueRoots;
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
  return { destination, source, state: linkedSource === source ? "current" : "replace", type: "dir" };
}

function inspectLegacySkillPath(skillRoot: string, canonicalSourceRoot: string, skillName: string): LegacySkillPath {
  const destination = path.resolve(skillRoot, skillName);
  validateMutationOutsideSourceTree(destination, canonicalSourceRoot);
  return { destination, exists: lstatSync(destination, { throwIfNoEntry: false }) !== undefined };
}

function agentConfigHome(homeDir: AgentConfigHomeDir, environment: NodeJS.ProcessEnv): string {
  if (homeDir === "codex") {
    return environment.CODEX_HOME ?? path.join(homedir(), ".codex");
  }
  return environment.CLAUDE_HOME ?? path.join(homedir(), ".claude");
}

/** Recursively collect every regular file under `dir`, as paths relative to `dir`. */
function listFilesRecursively(dir: string): string[] {
  const results: string[] = [];
  const walk = (current: string, relative: string): void => {
    for (const entry of readdirSync(current)) {
      const entryPath = path.join(current, entry);
      const entryRelative = relative === "" ? entry : path.join(relative, entry);
      if (statSync(entryPath).isDirectory()) {
        walk(entryPath, entryRelative);
      } else {
        results.push(entryRelative);
      }
    }
  };
  walk(dir, "");
  return results;
}

/**
 * Discover every file under `agent-config/<home>/...` and build a symlink plan
 * mirroring the relative path into the matching home. The folder layout is the
 * only source of truth - no per-file table to keep in sync.
 */
function createAgentConfigLinks(
  agentConfigSourceRoot: string,
  canonicalAgentConfigSourceRoot: string,
  environment: NodeJS.ProcessEnv,
): SkillLink[] {
  const links: SkillLink[] = [];
  for (const homeDir of AGENT_CONFIG_HOME_DIRS) {
    const homeSourceRoot = path.join(agentConfigSourceRoot, homeDir);
    if (!existsSync(homeSourceRoot)) continue;
    const destinationHome = agentConfigHome(homeDir, environment);
    for (const relative of listFilesRecursively(homeSourceRoot)) {
      const source = path.resolve(homeSourceRoot, relative);
      const destination = path.resolve(destinationHome, relative);
      validateMutationOutsideSourceTree(destination, canonicalAgentConfigSourceRoot);
      const stat = lstatSync(destination, { throwIfNoEntry: false });
      const linkedSource = stat?.isSymbolicLink() ? path.resolve(path.dirname(destination), readlinkSync(destination)) : undefined;
      links.push({ destination, source, state: linkedSource === source ? "current" : "replace", type: "file" });
    }
  }
  return links;
}

function createInstallPlan(skillRoots: readonly string[], skillsSourceRoot: string): SkillInstallPlan {
  if (!existsSync(skillsSourceRoot)) {
    throw new Error(`Packaged skills directory is missing: ${skillsSourceRoot}`);
  }
  const canonicalSourceRoot = realpathSync(skillsSourceRoot);
  const canonicalLinks = skillRoots.flatMap((root) =>
    PUBLIC_SKILL_NAMES.map((name) => inspectSkillLink(root, canonicalSourceRoot, canonicalSourceRoot, name)),
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
  symlinkSync(link.source, link.destination, process.platform === "win32" ? "junction" : link.type);
}

export function installPublicSkills(options: InstallPublicSkillsOptions = {}): void {
  const environment = options.environment ?? process.env;
  const skillsSourceRoot = options.skillsSourceRoot ?? resolveSkillsSourceRoot();
  const agentConfigSourceRoot = options.agentConfigSourceRoot ?? resolveAgentConfigSourceRoot();
  const output = options.output ?? process.stdout;
  const skillRoots = normalizeSkillRoots([
    path.join(environment.CODEX_HOME ?? path.join(homedir(), ".codex"), "skills"),
    path.join(environment.CLAUDE_HOME ?? path.join(homedir(), ".claude"), "skills"),
    path.join(environment.AGENTS_HOME ?? path.join(homedir(), ".agents"), "skills"),
  ]);
  const { canonicalLinks, legacyPaths } = createInstallPlan(skillRoots, skillsSourceRoot);

  const canonicalAgentConfigSourceRoot = realpathSync(agentConfigSourceRoot);
  const agentConfigLinks = createAgentConfigLinks(agentConfigSourceRoot, canonicalAgentConfigSourceRoot, environment);

  canonicalLinks.forEach(installSkillLink);
  agentConfigLinks.forEach(installSkillLink);
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
  agentConfigLinks.forEach((link) => {
    if (link.state === "current") {
      output.write(`Agent file already linked: ${link.destination}\n`);
    } else {
      output.write(`Linked agent file: ${link.destination} -> ${link.source}\n`);
    }
  });
}
