import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Copies the mux ui page assets from an apps/cli source tree into its dist,
 * where the CLI serves them from on every request. Everything in `src/ui` is
 * a page asset except test sources, which stay beside the page sources and
 * never ship.
 */
export function copyUiPageAssets(packageRoot: string): void {
  mkdirSync(path.join(packageRoot, "dist", "ui"), { recursive: true });
  cpSync(path.join(packageRoot, "src", "ui"), path.join(packageRoot, "dist", "ui"), {
    recursive: true,
    filter: (entry) => !entry.endsWith(".test.ts"),
  });
}
