import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createUiServer, parseUiArguments, uiHelpText, type UiServerOptions } from "./ui-server.js";

const FIXTURE_RUN_ID = "alpha-branch-2026-11-28T10-00-00-000Z";

function makeArtifactDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "devx-mux-ui-server-"));
  writeFileSync(
    path.join(directory, "alpha-branch-codex-2026-11-28T10-00-00-000Z.md"),
    "# Codex review\n\n## Findings\n\n- P1: sample finding\n",
    { encoding: "utf8" },
  );
  writeFileSync(
    path.join(directory, "alpha-branch-grok-2026-11-28T10-00-00-000Z.md"),
    "# Grok review\n\n## Summary\n\nAll standards pass.\n",
    { encoding: "utf8" },
  );
  writeFileSync(path.join(directory, "alpha-pr-grok-2026-11-28T11-00-00-000Z.md"), "# Grok pr review\n", { encoding: "utf8" });
  writeFileSync(path.join(directory, "alpha-branch-both-2026-11-28T10-00-00-000Z.md"), "# combined\n", { encoding: "utf8" });
  writeFileSync(path.join(directory, "unrelated.md"), "# not a review\n", { encoding: "utf8" });
  return directory;
}

function makeAssetsDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "devx-mux-ui-assets-"));
  writeFileSync(path.join(directory, "index.html"), "<!doctype html><title>page</title>", { encoding: "utf8" });
  writeFileSync(path.join(directory, "app.js"), "const served = true;\n", { encoding: "utf8" });
  writeFileSync(path.join(directory, "style.css"), "body { color: black; }\n", { encoding: "utf8" });
  return directory;
}

interface RunningServer {
  readonly baseUrl: string;
  readonly artifactDirectory: string;
  readonly assetsDirectory: string;
  close(): Promise<void>;
}

async function startServer(): Promise<RunningServer> {
  const options: UiServerOptions = { artifactDirectory: makeArtifactDirectory(), assetsDirectory: makeAssetsDirectory() };
  const server = createUiServer(options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address !== null && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    artifactDirectory: options.artifactDirectory,
    assetsDirectory: options.assetsDirectory,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
      rmSync(options.artifactDirectory, { recursive: true, force: true });
      rmSync(options.assetsDirectory, { recursive: true, force: true });
    },
  };
}

test("lists runs newest first as JSON with repository, scope, reviewers, and time", async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/runs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
  const body = await response.json() as { readonly runs: readonly { readonly id: string; readonly repository: string; readonly scope: string; readonly startedAt: string; readonly reviewers: readonly string[] }[] };

  assert.deepEqual(
    body.runs.map((run) => `${run.id} ${run.repository} ${run.scope} ${run.startedAt} ${run.reviewers.join("+")}`),
    [
      "alpha-pr-2026-11-28T11-00-00-000Z alpha pr 2026-11-28T11:00:00.000Z Grok",
      `${FIXTURE_RUN_ID} alpha branch 2026-11-28T10:00:00.000Z Codex+Grok`,
    ],
  );
});

test("serves a selected run with every provider report verbatim", async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/runs/${FIXTURE_RUN_ID}`);
  assert.equal(response.status, 200);
  const body = await response.json() as { readonly id: string; readonly reports: readonly { readonly provider: string; readonly markdown: string }[] };

  assert.equal(body.id, FIXTURE_RUN_ID);
  assert.deepEqual(
    body.reports.map((report) => `${report.provider}: ${report.markdown.trim()}`),
    ["Codex: # Codex review\n\n## Findings\n\n- P1: sample finding", "Grok: # Grok review\n\n## Summary\n\nAll standards pass."],
  );
});

test("a missing run responds 404 and unknown paths never escape the asset table", async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const missingRun = await fetch(`${server.baseUrl}/api/runs/does-not-exist`);
  assert.equal(missingRun.status, 404);
  const traversal = await fetch(`${server.baseUrl}/api/runs/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(traversal.status, 404);
  const unknownAsset = await fetch(`${server.baseUrl}/../apps/cli/src/ui-runs.ts`);
  assert.equal(unknownAsset.status, 404);
  const missingPath = await fetch(`${server.baseUrl}/nothing-here`);
  assert.equal(missingPath.status, 404);
  assert.match((await missingPath.json() as { readonly error: string }).error, /Unknown path/);
});

test("serves page assets from disk on every request so edits appear on reload", async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const appJsPath = path.join(server.assetsDirectory, "app.js");
  const first = await fetch(`${server.baseUrl}/app.js`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(await first.text(), "const served = true;\n");

  writeFileSync(appJsPath, "const served = 'edited';\n", { encoding: "utf8" });
  const second = await fetch(`${server.baseUrl}/app.js`);
  assert.equal(await second.text(), "const served = 'edited';\n");

  const page = await fetch(`${server.baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
  assert.equal(await page.text(), "<!doctype html><title>page</title>");
});

test("an empty or missing artifact directory lists zero runs instead of failing", async (t) => {
  const parent = mkdtempSync(path.join(tmpdir(), "devx-mux-ui-server-empty-"));
  const artifactDirectory = path.join(parent, "does-not-exist");
  const assetsDirectory = makeAssetsDirectory();
  const server = createUiServer({ artifactDirectory, assetsDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address !== null && typeof address === "object");
  t.after(() => {
    server.close();
    rmSync(parent, { recursive: true, force: true });
    rmSync(assetsDirectory, { recursive: true, force: true });
  });

  const response = await fetch(`http://127.0.0.1:${address.port}/api/runs`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { runs: [] });
});

test("rejects methods other than GET", async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/runs`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("parses ui arguments with the default port", () => {
  assert.deepEqual(parseUiArguments([]), { port: 4900 });
  assert.deepEqual(parseUiArguments(["--port", "5321"]), { port: 5321 });
  assert.deepEqual(parseUiArguments(["--dir", "/tmp/devx-mux-501", "--port", "8080"]), {
    directory: "/tmp/devx-mux-501",
    port: 8080,
  });
});

test("rejects invalid ports and unexpected positionals", () => {
  assert.throws(() => parseUiArguments(["--port", "0"]), /Unsupported port: 0/);
  assert.throws(() => parseUiArguments(["--port", "70000"]), /Unsupported port: 70000/);
  assert.throws(() => parseUiArguments(["--port", "http"]), /Unsupported port: http/);
  assert.throws(() => parseUiArguments(["serve"]), /Unexpected/);
});

test("documents usage, the artifact directory, and the local-only binding", () => {
  const help = uiHelpText();
  assert.match(help, /mux ui \[--dir PATH\] \[--port PORT\]/);
  assert.match(help, /review artifact directory/);
  assert.match(help, /127\.0\.0\.1/);
});
