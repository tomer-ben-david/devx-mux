import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrowserReviewState, type BrowserReviewState, type ReviewBoundary } from "./chatgpt-browser-state.ts";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));

interface CmuxHtmlResponse {
  value: string;
}

function resolveTarget(tool: "cmux" | "rex", target: string): string {
  return execFileSync(path.join(scriptsDirectory, "review-resolve-target.sh"), [tool, target], {
    encoding: "utf8",
  }).trim();
}

function cmuxEnvironment(): NodeJS.ProcessEnv {
  const socket = execFileSync(path.join(scriptsDirectory, "cmux-review-socket-path.sh"), [], { encoding: "utf8" }).trim();
  return { ...process.env, CMUX_SOCKET_PATH: socket };
}

function cmuxExecutable(): string {
  try {
    return execFileSync("sh", ["-c", "command -v cmux"], { encoding: "utf8" }).trim();
  } catch {
    return "/Applications/cmux.app/Contents/Resources/bin/cmux";
  }
}

function requireChatGptUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || (url.hostname !== "chatgpt.com" && !url.hostname.endsWith(".chatgpt.com"))) {
    throw new Error(`Refusing browser read: selected target is not ChatGPT (${url.href})`);
  }
  return url.href;
}

function parseCmuxHtmlResponse(raw: string): string {
  const value = JSON.parse(raw) as Partial<CmuxHtmlResponse>;
  if (typeof value.value !== "string" || !value.value) {
    throw new Error("Malformed cmux browser HTML response");
  }
  return value.value;
}

function rexSocketPath(): string {
  return execFileSync(path.join(scriptsDirectory, "rex-review-socket-path.sh"), [], { encoding: "utf8" }).trim();
}

function runRexBrowserCommand(socket: string, command: string): string {
  const raw = execFileSync("nc", ["-U", socket], { input: `${command}\n`, encoding: "utf8" });
  if (!raw.startsWith("ok ")) {
    throw new Error(`Unexpected Rex browser response: ${raw || "<empty>"}`);
  }
  return raw;
}

function rexResponseBody(raw: string): string {
  const newline = raw.indexOf("\n");
  return newline >= 0 ? raw.slice(newline + 1) : "";
}

export interface ReviewPageSnapshot {
  conversationUrl: string;
  html: string;
}

export function readReviewPage(tool: "cmux" | "rex", target: string): ReviewPageSnapshot {
  const handle = resolveTarget(tool, target);
  if (tool === "cmux") {
    const executable = cmuxExecutable();
    const env = cmuxEnvironment();
    const conversationUrl = requireChatGptUrl(execFileSync(executable, ["browser", handle, "get", "url"], { encoding: "utf8", env }));
    const rawHtml = execFileSync(executable, ["browser", handle, "get", "html", "#thread", "--json"], {
      encoding: "utf8",
      env,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { conversationUrl, html: parseCmuxHtmlResponse(rawHtml) };
  }

  const socket = rexSocketPath();
  const urlResponse = runRexBrowserCommand(socket, `browser-url ${handle}`);
  const urlMatch = urlResponse.match(/\burl=(https:\/\/[^\s]+)/);
  if (!urlMatch?.[1]) throw new Error("Malformed Rex browser URL response");
  const conversationUrl = requireChatGptUrl(urlMatch[1]);
  const html = rexResponseBody(runRexBrowserCommand(socket, `browser-get ${handle} html #thread`));
  if (!html) throw new Error("Rex browser returned empty ChatGPT thread HTML");
  return { conversationUrl, html };
}

export function readBrowserReviewState(
  tool: "cmux" | "rex",
  target: string,
  boundary: ReviewBoundary,
): BrowserReviewState {
  const page = readReviewPage(tool, target);
  return parseBrowserReviewState(page.html, page.conversationUrl, boundary);
}

export function formatBrowserReviewState(state: BrowserReviewState, boundaryLabel: string): string {
  if (!state.requestObserved) return `waiting missing ${boundaryLabel}`;
  if (!state.responseObserved) return `waiting response for ${boundaryLabel}`;
  if (!state.responseComplete) return `waiting response incomplete for ${boundaryLabel}`;
  if (state.generating) return `waiting generating ${boundaryLabel}`;
  if (!state.answer.trim()) return `waiting empty ${boundaryLabel}`;
  return state.answer;
}
