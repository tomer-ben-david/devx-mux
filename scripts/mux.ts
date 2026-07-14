import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repositoryRoot);

const HELP = `DevX Mux local runner

Usage:
  ./mux.sh setup                 Install dependencies and build
  ./mux.sh check                 Run tests, type checks, and build
  ./mux.sh test                  Run tests
  ./mux.sh typecheck             Run TypeScript verification
  ./mux.sh build                 Build all packages
  ./mux.sh link                  Link the \`mux\` command globally
  ./mux.sh link-agent-files      Link public skills for Codex, Claude, and shared agents
  ./mux.sh review [arguments]    Run \`mux review\`
  ./mux.sh multireview [args]    Run concurrent Codex and Grok review
  ./mux.sh clean                 Remove generated build output
  ./mux.sh help                  Show this help

The same commands work without shell through: npm run mux -- <command>

Examples:
  ./mux.sh review branch --provider grok --dry-run
  ./mux.sh review commit HEAD --provider grok
  ./mux.sh review local --provider grok --repo /path/to/repository
`;

function npmRun(script: string): void {
  run("npm", ["run", script]);
}

interface SkillLink {
  destination: string;
  source: string;
  state: "missing" | "current" | "stale";
}

function inspectSkillLink(skillRoot: string, skillName: string): SkillLink {
  const source = path.join(repositoryRoot, "skills", skillName);
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

function installSkillLink(link: SkillLink): void {
  if (link.state === "current") {
    process.stdout.write(`Skill already linked: ${link.destination}\n`);
    return;
  }
  mkdirSync(path.dirname(link.destination), { recursive: true });
  if (link.state === "stale") {
    unlinkSync(link.destination);
  }
  symlinkSync(link.source, link.destination, "dir");
  process.stdout.write(`Linked skill: ${link.destination} -> ${link.source}\n`);
}

const [command = "help", ...arguments_] = process.argv.slice(2);

switch (command) {
  case "setup":
    run("npm", ["install"]);
    npmRun("build");
    break;
  case "check":
    npmRun("test");
    npmRun("typecheck");
    npmRun("build");
    break;
  case "test":
  case "typecheck":
  case "build":
    npmRun(command);
    break;
  case "link":
    npmRun("build");
    run("npm", ["link", "--workspace", "@devx-mux/cli"]);
    break;
  case "link-agent-files":
    const skillRoots = [
      path.join(process.env.CODEX_HOME ?? path.join(homedir(), ".codex"), "skills"),
      path.join(process.env.CLAUDE_HOME ?? path.join(homedir(), ".claude"), "skills"),
      path.join(process.env.AGENTS_HOME ?? path.join(homedir(), ".agents"), "skills"),
    ];
    const skillNames = ["devx-mux", "mux-multireview", "mux-orchestrate", "pr-title-description", "staged-pr-review"];
    const links = skillRoots.flatMap((root) => skillNames.map((name) => inspectSkillLink(root, name)));
    links.forEach(installSkillLink);
    break;
  case "review":
  case "multireview":
    run(process.execPath, ["scripts/cli.ts", command, ...arguments_]);
    break;
  case "clean":
    rmSync("apps/cli/dist", { recursive: true, force: true });
    rmSync("packages/reviewer/dist", { recursive: true, force: true });
    rmSync("packages/terminal-ui/dist", { recursive: true, force: true });
    break;
  case "help":
  case "-h":
  case "--help":
    process.stdout.write(HELP);
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exit(2);
}
