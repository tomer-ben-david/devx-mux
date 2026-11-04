import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const CODEX_AUTH_MODES = ["subscription", "api"] as const;
export type CodexAuthMode = (typeof CODEX_AUTH_MODES)[number];

export interface CodexAuthStatus {
  readonly current: CodexAuthMode;
  readonly saved: readonly CodexAuthMode[];
}

export interface CodexAuthSwitch {
  readonly from: CodexAuthMode;
  readonly to: CodexAuthMode;
  readonly changed: boolean;
}

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

export function codexAuthHelpText(): string {
  return `DevX Mux codex-auth

Switch Codex between ChatGPT-subscription and API-key sign-in by swapping only
$CODEX_HOME/auth.json (default ~/.codex/auth.json). config.toml is never touched.

Usage:
  mux codex-auth status            Show the active mode and which modes are saved
  mux codex-auth subscription      Switch to ChatGPT-subscription sign-in (alias: sub)
  mux codex-auth api               Switch to API-key sign-in
  mux codex-auth save              Save the active sign-in so it can be switched back to

One auth file is kept per mode in $CODEX_HOME/auth-profiles/. Every switch first
writes the active file back to its own slot, so refreshed tokens are never lost.
To create the first profile for a mode, sign in with Codex in that mode and run
\`mux codex-auth save\`. Restart the Codex app and running sessions after a switch.
`;
}

export function codexHomeDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment["CODEX_HOME"];
  return configured === undefined || configured === "" ? path.join(homedir(), ".codex") : configured;
}

function activeAuthPath(codexHome: string): string {
  return path.join(codexHome, "auth.json");
}

function profilePath(codexHome: string, mode: CodexAuthMode): string {
  return path.join(codexHome, "auth-profiles", `${mode}.json`);
}

function parseAuthMode(content: string, source: string): CodexAuthMode {
  let authMode: string | undefined;
  try {
    const parsed: { readonly auth_mode?: string } = JSON.parse(content);
    authMode = parsed.auth_mode;
  } catch (error) {
    throw new Error(`${source} is not valid JSON.`, { cause: error });
  }
  switch (authMode) {
    case "chatgpt":
      return "subscription";
    case "apikey":
      return "api";
    default:
      throw new Error(`${source} has an unrecognized auth_mode (${authMode === undefined ? "missing" : `"${authMode}"`}); expected "chatgpt" or "apikey".`);
  }
}

function readAuthFile(filePath: string): { readonly content: string; readonly mode: CodexAuthMode } {
  if (!existsSync(filePath)) throw new Error(`${filePath} does not exist. Sign in with Codex first.`);
  const content = readFileSync(filePath, "utf8");
  return { content, mode: parseAuthMode(content, filePath) };
}

function writePrivateFileAtomically(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { mode: PRIVATE_FILE_MODE });
  renameSync(temporaryPath, filePath);
}

export function parseCodexAuthTarget(value: string): CodexAuthMode {
  if (value === "sub" || value === "subscription") return "subscription";
  if (value === "api") return "api";
  throw new Error(`Unknown codex-auth mode "${value}". Use subscription (sub) or api.`);
}

export function codexAuthStatus(codexHome: string): CodexAuthStatus {
  const current = readAuthFile(activeAuthPath(codexHome)).mode;
  const saved = CODEX_AUTH_MODES.filter((mode) => existsSync(profilePath(codexHome, mode)));
  return { current, saved };
}

export function saveCurrentCodexAuth(codexHome: string): CodexAuthMode {
  const active = readAuthFile(activeAuthPath(codexHome));
  writePrivateFileAtomically(profilePath(codexHome, active.mode), active.content);
  return active.mode;
}

export function switchCodexAuth(codexHome: string, target: CodexAuthMode): CodexAuthSwitch {
  const active = readAuthFile(activeAuthPath(codexHome));
  if (active.mode === target) return { from: active.mode, to: target, changed: false };

  const targetPath = profilePath(codexHome, target);
  if (!existsSync(targetPath)) {
    throw new Error(`No saved ${target} sign-in at ${targetPath}. Sign in with Codex using ${target}, then run \`mux codex-auth save\`.`);
  }
  const replacement = readAuthFile(targetPath);
  if (replacement.mode !== target) {
    throw new Error(`${targetPath} holds a ${replacement.mode} sign-in, not ${target}. Fix or remove that file.`);
  }

  writePrivateFileAtomically(profilePath(codexHome, active.mode), active.content);
  writePrivateFileAtomically(activeAuthPath(codexHome), replacement.content);
  return { from: active.mode, to: target, changed: true };
}

export function runCodexAuth(argumentsList: readonly string[], codexHome: string): string {
  const [subcommand, ...rest] = argumentsList;
  if (subcommand === "--help" || subcommand === "-h") return codexAuthHelpText();
  if (rest.length > 0) throw new Error(`mux codex-auth ${subcommand ?? ""} does not accept extra arguments.`);
  if (subcommand === undefined || subcommand === "status") {
    const status = codexAuthStatus(codexHome);
    return `current: ${status.current}\nsaved: ${status.saved.length === 0 ? "none" : status.saved.join(", ")}\n`;
  }
  if (subcommand === "save") return `saved ${saveCurrentCodexAuth(codexHome)} sign-in\n`;
  const result = switchCodexAuth(codexHome, parseCodexAuthTarget(subcommand));
  return result.changed
    ? `switched ${result.from} -> ${result.to}. Restart the Codex app and running Codex sessions to apply.\n`
    : `already on ${result.to}\n`;
}
