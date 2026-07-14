import { readFileSync } from "node:fs";

const releaseTag = process.argv[2];
if (releaseTag === undefined) {
  throw new Error("Usage: npm run verify:release -- v<package-version>");
}

const packageMetadata = JSON.parse(
  readFileSync(new URL("../apps/cli/package.json", import.meta.url), "utf8"),
) as { readonly version?: unknown };
if (typeof packageMetadata.version !== "string") {
  throw new Error("DevX Mux package version is missing.");
}

const expectedTag = `v${packageMetadata.version}`;
if (releaseTag !== expectedTag) {
  throw new Error(`Release tag ${releaseTag} does not match package version ${packageMetadata.version}. Expected ${expectedTag}.`);
}
