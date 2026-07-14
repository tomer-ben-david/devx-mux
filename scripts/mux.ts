import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installPublicSkills } from "../apps/cli/src/skill-installer.ts";
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
    run("npm", ["link", "--workspace", "devx-mux"]);
    break;
  case "link-agent-files":
    installPublicSkills({ skillsSourceRoot: path.join(repositoryRoot, "skills") });
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
