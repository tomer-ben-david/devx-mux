import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codexAuthStatus,
  codexHomeDirectory,
  parseCodexAuthTarget,
  runCodexAuth,
  saveCurrentCodexAuth,
  switchCodexAuth,
} from "./codex-auth.js";

const SUBSCRIPTION_AUTH = (marker: string): string => JSON.stringify({ auth_mode: "chatgpt", OPENAI_API_KEY: null, tokens: { refresh_token: marker } });
const API_AUTH = (marker: string): string => JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: marker });

function withCodexHome(run: (codexHome: string) => void): void {
  const codexHome = mkdtempSync(path.join(tmpdir(), "devx-mux-codex-auth-"));
  try {
    run(codexHome);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
}

function writeActive(codexHome: string, content: string): void {
  writeFileSync(path.join(codexHome, "auth.json"), content);
}

function writeProfile(codexHome: string, name: string, content: string): void {
  mkdirSync(path.join(codexHome, "auth-profiles"), { recursive: true });
  writeFileSync(path.join(codexHome, "auth-profiles", `${name}.json`), content);
}

function readActive(codexHome: string): string {
  return readFileSync(path.join(codexHome, "auth.json"), "utf8");
}

function readProfile(codexHome: string, name: string): string {
  return readFileSync(path.join(codexHome, "auth-profiles", `${name}.json`), "utf8");
}

test("status reports the active mode and which profiles are saved", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, SUBSCRIPTION_AUTH("s1"));
    assert.deepEqual(codexAuthStatus(codexHome), { current: "subscription", saved: [] });
    writeProfile(codexHome, "api", API_AUTH("k1"));
    assert.deepEqual(codexAuthStatus(codexHome), { current: "subscription", saved: ["api"] });
  });
});

test("switching swaps only auth.json and writes the active file back to its own slot", () => {
  withCodexHome((codexHome) => {
    writeFileSync(path.join(codexHome, "config.toml"), "model = \"x\"\n");
    writeActive(codexHome, SUBSCRIPTION_AUTH("rotated-token"));
    writeProfile(codexHome, "subscription", SUBSCRIPTION_AUTH("stale-token"));
    writeProfile(codexHome, "api", API_AUTH("k1"));

    const result = switchCodexAuth(codexHome, "api");

    assert.deepEqual(result, { from: "subscription", to: "api", changed: true });
    assert.equal(readActive(codexHome), API_AUTH("k1"));
    assert.equal(readProfile(codexHome, "subscription"), SUBSCRIPTION_AUTH("rotated-token"));
    assert.equal(readFileSync(path.join(codexHome, "config.toml"), "utf8"), "model = \"x\"\n");

    switchCodexAuth(codexHome, "subscription");
    assert.equal(readActive(codexHome), SUBSCRIPTION_AUTH("rotated-token"));
  });
});

test("switching to the active mode changes nothing", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, API_AUTH("k1"));
    assert.deepEqual(switchCodexAuth(codexHome, "api"), { from: "api", to: "api", changed: false });
    assert.equal(existsSync(path.join(codexHome, "auth-profiles")), false);
  });
});

test("refuses to switch when the target has no saved profile and leaves auth.json untouched", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, SUBSCRIPTION_AUTH("s1"));
    assert.throws(() => switchCodexAuth(codexHome, "api"), /No saved api sign-in/);
    assert.equal(readActive(codexHome), SUBSCRIPTION_AUTH("s1"));
    assert.equal(existsSync(path.join(codexHome, "auth-profiles")), false);
  });
});

test("refuses a profile whose contents belong to the other mode", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, SUBSCRIPTION_AUTH("s1"));
    writeProfile(codexHome, "api", SUBSCRIPTION_AUTH("mislabelled"));
    assert.throws(() => switchCodexAuth(codexHome, "api"), /holds a subscription sign-in, not api/);
    assert.equal(readActive(codexHome), SUBSCRIPTION_AUTH("s1"));
  });
});

test("fails loudly on a missing, malformed, or unrecognized auth file", () => {
  withCodexHome((codexHome) => {
    assert.throws(() => codexAuthStatus(codexHome), /does not exist/);
    writeActive(codexHome, "not json");
    assert.throws(() => codexAuthStatus(codexHome), /not valid JSON/);
    writeActive(codexHome, JSON.stringify({ OPENAI_API_KEY: "k" }));
    assert.throws(() => codexAuthStatus(codexHome), /unrecognized auth_mode \(missing\)/);
    writeActive(codexHome, JSON.stringify({ auth_mode: "future-mode" }));
    assert.throws(() => codexAuthStatus(codexHome), /unrecognized auth_mode \("future-mode"\)/);
  });
});

test("save stores the active sign-in under its own mode with owner-only permissions", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, API_AUTH("k1"));
    assert.equal(saveCurrentCodexAuth(codexHome), "api");
    assert.equal(readProfile(codexHome, "api"), API_AUTH("k1"));
    if (process.platform !== "win32") {
      assert.equal(statSync(path.join(codexHome, "auth-profiles", "api.json")).mode & 0o777, 0o600);
      assert.equal(statSync(path.join(codexHome, "auth-profiles")).mode & 0o777, 0o700);
    }
  });
});

test("resolves the Codex home from CODEX_HOME, defaulting to ~/.codex", () => {
  assert.equal(codexHomeDirectory({ CODEX_HOME: "/custom/codex" }), "/custom/codex");
  assert.equal(path.basename(codexHomeDirectory({})), ".codex");
  assert.equal(path.basename(codexHomeDirectory({ CODEX_HOME: "" })), ".codex");
});

test("accepts sub as an alias and rejects unknown modes", () => {
  assert.equal(parseCodexAuthTarget("sub"), "subscription");
  assert.equal(parseCodexAuthTarget("subscription"), "subscription");
  assert.equal(parseCodexAuthTarget("api"), "api");
  assert.throws(() => parseCodexAuthTarget("oauth"), /Unknown codex-auth mode "oauth"/);
});

test("runCodexAuth renders status, switches, and rejects extra arguments", () => {
  withCodexHome((codexHome) => {
    writeActive(codexHome, SUBSCRIPTION_AUTH("s1"));
    writeProfile(codexHome, "api", API_AUTH("k1"));
    assert.equal(runCodexAuth([], codexHome), "current: subscription\nsaved: api\n");
    assert.equal(runCodexAuth(["status"], codexHome), "current: subscription\nsaved: api\n");
    assert.match(runCodexAuth(["api"], codexHome), /^switched subscription -> api\. Restart/);
    assert.equal(runCodexAuth(["api"], codexHome), "already on api\n");
    assert.throws(() => runCodexAuth(["api", "extra"], codexHome), /does not accept extra arguments/);
    assert.match(runCodexAuth(["--help"], codexHome), /Usage:/);
  });
});
