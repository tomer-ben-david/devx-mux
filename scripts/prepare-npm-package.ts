import { chmodSync, cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildSkillScripts } from "./build-skill-scripts.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repositoryRoot, "apps", "cli");
const outputFile = path.join(packageRoot, "dist", "main.js");

await buildSkillScripts();

rmSync(path.join(packageRoot, "dist"), { recursive: true, force: true });
rmSync(path.join(packageRoot, "skills"), { recursive: true, force: true });
mkdirSync(path.dirname(outputFile), { recursive: true });

await build({
  entryPoints: [path.join(packageRoot, "src", "main.ts")],
  outfile: outputFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  packages: "external",
  alias: {
    "@devx-mux/reviewer": path.join(repositoryRoot, "packages", "reviewer", "src", "index.ts"),
    "@devx-mux/terminal-ui": path.join(repositoryRoot, "packages", "terminal-ui", "src", "index.ts"),
  },
});

chmodSync(outputFile, 0o755);
cpSync(path.join(repositoryRoot, "skills"), path.join(packageRoot, "skills"), {
  recursive: true,
  filter: (source) => !source.endsWith(".test.ts"),
});
cpSync(path.join(repositoryRoot, "README.md"), path.join(packageRoot, "README.md"));
cpSync(path.join(repositoryRoot, "LICENSE"), path.join(packageRoot, "LICENSE"));
