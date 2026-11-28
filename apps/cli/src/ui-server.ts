import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { readReviewRuns, readRunReports, type ReportProvider, type ReviewRun, type RunReportContent } from "./ui-runs.js";

export const DEFAULT_UI_PORT = 4900;
const LOCAL_HOST = "127.0.0.1";
const RUN_API_PREFIX = "/api/runs/";

export function uiHelpText(): string {
  return `DevX Mux ui

Browse saved review runs from \`mux review\` and \`mux multireview\` in a local
web page. The artifact directory, the reports, and the page assets are read
from disk on every request, so new runs and edited assets appear on reload.

Usage:
  mux ui [--dir PATH] [--port PORT]

Options:
  --dir PATH   Artifact directory to browse. Default: the review artifact directory.
  --port PORT  Port to bind on ${LOCAL_HOST}. Default: ${DEFAULT_UI_PORT}.

The server only binds to ${LOCAL_HOST} and never writes to the artifact directory.
`;
}

export interface UiArguments {
  readonly directory?: string;
  readonly port: number;
}

export function parseUiArguments(argv: readonly string[]): UiArguments {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: false,
    strict: true,
    options: {
      dir: { type: "string" },
      port: { type: "string" },
    },
  });
  const rawPort = parsed.values.port;
  if (rawPort === undefined) return { port: DEFAULT_UI_PORT };
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Unsupported port: ${rawPort}. Use an integer between 1 and 65535.`);
  }
  return {
    ...(parsed.values.dir === undefined ? {} : { directory: parsed.values.dir }),
    port,
  };
}

export interface UiServerOptions {
  readonly artifactDirectory: string;
  /** Directory holding index.html, app.js, and style.css; read on every request. */
  readonly assetsDirectory: string;
}

export interface UiCommandDefaults {
  readonly artifactDirectory: string;
  readonly assetsDirectory: string;
}

/** Parses `mux ui` arguments, then serves the review-run page until the process is stopped. */
export async function runUiCommand(argv: readonly string[], defaults: UiCommandDefaults): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(uiHelpText());
    return;
  }
  const { directory, port } = parseUiArguments(argv);
  const artifactDirectory = directory ?? defaults.artifactDirectory;
  const server = createUiServer({ artifactDirectory, assetsDirectory: defaults.assetsDirectory });
  await listen(server, port);
  process.stdout.write(`DevX Mux review runs: http://${LOCAL_HOST}:${port}\nDirectory: ${artifactDirectory}\nStop with Ctrl+C.\n`);
}

/** Serves the page assets and the review-run JSON API without writing anything. */
export function createUiServer(options: UiServerOptions): Server {
  return createServer((request, response) => {
    respondToUiRequest(request, response, options).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      respondJson(response, 500, { error: describe(error) });
    });
  });
}

interface PageAsset {
  readonly file: string;
  readonly contentType: string;
}

const PAGE_ASSETS = new Map<string, PageAsset>([
  ["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/report-format.js", { file: "report-format.js", contentType: "text/javascript; charset=utf-8" }],
  ["/style.css", { file: "style.css", contentType: "text/css; charset=utf-8" }],
]);

interface RunSummary {
  readonly id: string;
  readonly repository: string;
  readonly scope: string;
  readonly startedAt: string;
  readonly reviewers: readonly ReportProvider[];
}

interface RunDetail {
  readonly id: string;
  readonly repository: string;
  readonly scope: string;
  readonly startedAt: string;
  readonly reviewers: readonly ReportProvider[];
  readonly reports: readonly RunReportContent[];
}

interface ErrorResponse {
  readonly error: string;
}

type ApiResponse = { readonly runs: readonly RunSummary[] } | RunDetail | ErrorResponse;

async function respondToUiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: UiServerOptions,
): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    respondJson(response, 405, { error: `Method ${request.method ?? "unknown"} is not allowed; use GET.` });
    return;
  }
  const { pathname } = new URL(request.url ?? "/", `http://${LOCAL_HOST}`);

  const asset = PAGE_ASSETS.get(pathname);
  if (asset !== undefined) {
    const body = await readFile(path.join(options.assetsDirectory, asset.file), "utf8");
    response.writeHead(200, { "Content-Type": asset.contentType, "Cache-Control": "no-store" });
    response.end(body);
    return;
  }

  if (pathname === "/api/runs") {
    const runs = await readReviewRuns(options.artifactDirectory);
    respondJson(response, 200, { runs: runs.map(toRunSummary) });
    return;
  }
  if (pathname.startsWith(RUN_API_PREFIX)) {
    await respondRunDetail(pathname.slice(RUN_API_PREFIX.length), response, options);
    return;
  }
  respondJson(response, 404, { error: `Unknown path ${pathname}.` });
}

async function respondRunDetail(encodedRunId: string, response: ServerResponse, options: UiServerOptions): Promise<void> {
  let runId: string;
  try {
    runId = decodeURIComponent(encodedRunId);
  } catch {
    respondJson(response, 400, { error: `The run id "${encodedRunId}" is not valid percent-encoding.` });
    return;
  }
  const runs = await readReviewRuns(options.artifactDirectory);
  const run = runs.find((candidate) => candidate.id === runId);
  if (run === undefined) {
    respondJson(response, 404, { error: `No review run "${runId}" exists in ${options.artifactDirectory}.` });
    return;
  }
  const reports = await readRunReports(run);
  const detail: RunDetail = {
    id: run.id,
    repository: run.repository,
    scope: run.scope,
    startedAt: run.startedAt,
    reviewers: run.reports.map((report) => report.provider),
    reports,
  };
  respondJson(response, 200, detail);
}

function toRunSummary(run: ReviewRun): RunSummary {
  return {
    id: run.id,
    repository: run.repository,
    scope: run.scope,
    startedAt: run.startedAt,
    reviewers: run.reports.map((report) => report.provider),
  };
}

function respondJson(response: ServerResponse, statusCode: number, body: ApiResponse): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOCAL_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
