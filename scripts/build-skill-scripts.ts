import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSkillScripts(): Promise<void> {
  const scriptsDirectory = path.join(repositoryRoot, "skills", "mux-orchestrate", "scripts");
  await build({
    entryPoints: {
      "chatgpt-review-wait": path.join(scriptsDirectory, "chatgpt-review-wait.ts"),
      "chatgpt-review-poll": path.join(scriptsDirectory, "chatgpt-review-poll.ts"),
      "chatgpt-review-adopt": path.join(scriptsDirectory, "chatgpt-review-adopt.ts"),
      "chatgpt-review-request": path.join(scriptsDirectory, "chatgpt-review-request.ts"),
    },
    outdir: scriptsDirectory,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minifyWhitespace: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildSkillScripts();
}
