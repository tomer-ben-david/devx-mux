import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repositoryRoot);

const HELP = `DevX Crew local runner

Usage:
  ./run.sh setup                 Install dependencies and build
  ./run.sh check                 Run tests, type checks, and build
  ./run.sh test                  Run tests
  ./run.sh typecheck             Run TypeScript verification
  ./run.sh build                 Build all packages
  ./run.sh link                  Link the \`devx\` command globally
  ./run.sh review [arguments]    Run \`devx review\`
  ./run.sh clean                 Remove generated build output
  ./run.sh help                  Show this help

The same commands work without shell through: npm run crew -- <command>

Examples:
  ./run.sh review branch --provider grok --dry-run
  ./run.sh review commit HEAD --provider grok
  ./run.sh review local --provider grok --repo /path/to/repository
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
    run("npm", ["link", "--workspace", "@devx-crew/cli"]);
    break;
  case "review":
    run(process.execPath, ["scripts/devx.ts", "review", ...arguments_]);
    break;
  case "clean":
    rmSync("apps/cli/dist", { recursive: true, force: true });
    rmSync("packages/reviewer/dist", { recursive: true, force: true });
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

