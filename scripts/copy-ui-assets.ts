import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repositoryRoot, "apps", "cli", "src", "ui");
const destination = path.join(repositoryRoot, "apps", "cli", "dist", "ui");

// tsc compiles only TypeScript, so the mux ui page assets are copied next to
// the compiled entry. The compiled CLI resolves them as <dist>/ui.
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
