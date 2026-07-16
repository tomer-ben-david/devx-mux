import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSkillScripts(): Promise<void> {
  const scriptsDirectory = path.join(repositoryRoot, "skills", "mux-orchestrate", "scripts");
  await build({
    entryPoints: [path.join(scriptsDirectory, "chatgpt-review-wait.ts")],
    outfile: path.join(scriptsDirectory, "chatgpt-review-wait.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildSkillScripts();
}
