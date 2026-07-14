import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cliPath = path.join(repositoryRoot, "apps", "cli", "dist", "main.js");

before(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: repositoryRoot });
});

const fakeProvider = `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");
if (process.argv.includes("--version")) {
  process.stdout.write("fake-provider 1.0.0\\n");
  process.exit(0);
}
writeFileSync(join(process.env.FAKE_PROVIDER_DIRECTORY, basename(process.argv[1]) + ".pid"), String(process.pid));
process.stdout.write(JSON.stringify({ type: "thread.started" }) + "\\n");
setInterval(() => undefined, 1_000);
`;

async function installFakeProviders(fixtureDirectory: string, providers: readonly string[]): Promise<void> {
  await Promise.all(providers.map(async (provider) => {
    const providerPath = path.join(fixtureDirectory, provider);
    await writeFile(providerPath, fakeProvider);
    await chmod(providerPath, 0o755);
  }));
}

async function waitForFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      watcher.close();
      reject(new Error(`Timed out waiting for ${filePath}`));
    }, 10_000);
    const finish = async (): Promise<void> => {
      try {
        const value = await readFile(filePath, "utf8");
        clearTimeout(timeout);
        watcher.close();
        resolve(value);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") reject(error);
      }
    };
    const watcher = watch(path.dirname(filePath), (_event, filename) => {
      if (filename === path.basename(filePath)) void finish();
    });
    void finish();
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

test("Ctrl+C cancels a single-provider CLI review and stops its detached provider", { skip: process.platform === "win32" }, async () => {
  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "devx-mux-cli-cancel-"));
  const providerPidPath = path.join(fixtureDirectory, "codex.pid");
  await installFakeProviders(fixtureDirectory, ["codex"]);

  const cli = spawn(
    process.execPath,
    [cliPath, "review", "codebase", "--provider", "codex", "--format", "markdown", "--repo", repositoryRoot],
    {
      env: {
        ...process.env,
        PATH: `${fixtureDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PROVIDER_DIRECTORY: fixtureDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  cli.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  let providerPid: number | undefined;
  try {
    providerPid = Number(await waitForFile(providerPidPath));
    assert.equal(processExists(providerPid), true);
    cli.kill("SIGINT");
    const result = await new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve) => {
      cli.once("close", (code, signal) => resolve({ code, signal }));
    });

    assert.deepEqual(result, { code: 130, signal: null });
    assert.equal(processExists(providerPid), false);
    assert.match(stderr, /Cancelled Codex was stopped\./);
    assert.doesNotMatch(stderr, /Failed|review failed|exited with status/);
  } finally {
    if (cli.exitCode === null && cli.signalCode === null) cli.kill("SIGKILL");
    if (providerPid !== undefined && processExists(providerPid)) {
      try {
        process.kill(-providerPid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});

test("Ctrl+C cancels both providers through the shared parallel lifecycle", { skip: process.platform === "win32" }, async () => {
  const fixtureDirectory = await mkdtemp(path.join(tmpdir(), "devx-mux-cli-parallel-cancel-"));
  await installFakeProviders(fixtureDirectory, ["codex", "grok"]);

  const cli = spawn(
    process.execPath,
    [cliPath, "review", "codebase", "--provider", "both", "--format", "markdown", "--repo", repositoryRoot],
    {
      env: {
        ...process.env,
        PATH: `${fixtureDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PROVIDER_DIRECTORY: fixtureDirectory,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  cli.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const providerPids: number[] = [];
  try {
    const providerPidTexts = await Promise.all([
      waitForFile(path.join(fixtureDirectory, "codex.pid")),
      waitForFile(path.join(fixtureDirectory, "grok.pid")),
    ]);
    providerPids.push(...providerPidTexts.map(Number));
    assert.equal(providerPids.every(processExists), true);
    cli.kill("SIGINT");
    const result = await new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve) => {
      cli.once("close", (code, signal) => resolve({ code, signal }));
    });

    assert.deepEqual(result, { code: 130, signal: null });
    assert.equal(providerPids.some(processExists), false);
    assert.match(stderr, /Review cancelled\. Codex and Grok were stopped\./);
    assert.doesNotMatch(stderr, /parallel review incomplete|Failed/);
  } finally {
    if (cli.exitCode === null && cli.signalCode === null) cli.kill("SIGKILL");
    for (const providerPid of providerPids) {
      if (!processExists(providerPid)) continue;
      try {
        process.kill(-providerPid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
