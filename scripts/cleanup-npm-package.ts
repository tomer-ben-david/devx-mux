import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repositoryRoot, "apps", "cli");

for (const stagedPath of ["skills", "README.md", "LICENSE"]) {
  rmSync(path.join(packageRoot, stagedPath), { recursive: true, force: true });
}
