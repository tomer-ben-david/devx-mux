import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyUiPageAssets } from "./ui-page-assets.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// tsc compiles only TypeScript, so the mux ui page assets are copied next to
// the compiled entry. The compiled CLI resolves them as <dist>/ui.
copyUiPageAssets(path.join(repositoryRoot, "apps", "cli"));
