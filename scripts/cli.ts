import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const callerDirectory = process.cwd();
process.chdir(repositoryRoot);

if (!existsSync("node_modules")) {
  process.stderr.write("DevX Mux is not set up. Run ./mux.sh setup or npm run mux -- setup first.\n");
  process.exit(1);
}

run("npm", ["run", "build"]);

const arguments_ = process.argv.slice(2);
process.chdir(callerDirectory);

run(process.execPath, [path.join(repositoryRoot, "apps", "cli", "dist", "main.js"), ...arguments_]);
