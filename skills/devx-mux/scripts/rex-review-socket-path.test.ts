import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "rex-review-socket-path.sh");

function socketPaths(root: string): { canonical: string; legacy: string; environment: NodeJS.ProcessEnv } {
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: root };
  delete environment.REX_SOCKET_PATH;

  if (process.platform === "darwin") {
    return {
      canonical: path.join(root, "Library", "Application Support", "rex", "rex.sock"),
      legacy: path.join(root, "Library", "Application Support", "rexide", "rexide.sock"),
      environment,
    };
  }

  const runtimeRoot = path.join(root, "runtime");
  environment.XDG_RUNTIME_DIR = runtimeRoot;
  return {
    canonical: path.join(runtimeRoot, "rex", "rex.sock"),
    legacy: path.join(runtimeRoot, "rexide", "rexide.sock"),
    environment,
  };
}

function resolveSocket(environment: NodeJS.ProcessEnv): string {
  return execFileSync(script, { encoding: "utf8", env: environment }).trim();
}

test("resolves the canonical Rex socket by default", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(path.join("/tmp", "dmx-rex-socket-"));
  try {
    const { canonical, environment } = socketPaths(root);
    assert.equal(resolveSocket(environment), canonical);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("uses the legacy RexIDE socket only when it is the available socket", { skip: process.platform === "win32" }, async () => {
  const root = mkdtempSync(path.join("/tmp", "dmx-rex-legacy-"));
  const { legacy, environment } = socketPaths(root);
  mkdirSync(path.dirname(legacy), { recursive: true });
  const server = createServer();

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(legacy, resolve);
    });
    assert.equal(resolveSocket(environment), legacy);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("honors an explicit Rex socket override", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(path.join("/tmp", "dmx-rex-override-"));
  try {
    const override = path.join(root, "custom.sock");
    const { environment } = socketPaths(root);
    assert.equal(resolveSocket({ ...environment, REX_SOCKET_PATH: override }), override);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
