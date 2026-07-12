import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const callerDirectory = process.cwd();
process.chdir(repositoryRoot);

if (!existsSync("node_modules")) {
  process.stderr.write("DevX Crew is not set up. Run ./run.sh setup or npm run crew -- setup first.\n");
  process.exit(1);
}

run("npm", ["run", "build"]);

const arguments_ = process.argv.slice(2);
const command = arguments_[0];
const hasExplicitRepository = arguments_.some((argument) => argument === "--repo" || argument.startsWith("--repo="));
const reviewArguments = (command === "review" || command === "multireview") && !hasExplicitRepository
  ? [...arguments_, "--repo", callerDirectory]
  : arguments_;

run(process.execPath, ["apps/cli/dist/main.js", ...reviewArguments]);
