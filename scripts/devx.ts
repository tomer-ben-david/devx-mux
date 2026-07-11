import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repositoryRoot);

if (!existsSync("node_modules")) {
  process.stderr.write("DevX Crew is not set up. Run ./run.sh setup or npm run crew -- setup first.\n");
  process.exit(1);
}

run("npm", ["run", "build"]);

run(process.execPath, ["apps/cli/dist/main.js", ...process.argv.slice(2)]);
