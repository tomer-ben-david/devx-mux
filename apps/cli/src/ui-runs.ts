import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Reviewers that persist a verbatim report file, in the order the UI presents
 * them. The file name segment is the lowercased label, matching how
 * `persistRawReview` writes `Codex` and `Grok` reports.
 */
export type ReportProvider = "Codex" | "Grok" | "Verifier";

const PROVIDER_LABELS: readonly ReportProvider[] = ["Codex", "Grok", "Verifier"];

/** `{repo}-{scope}-{provider}-{timestamp}.md`, written by `persistRawReview`. */
const REPORT_FILE_NAME =
  /^(?<repository>.+)-(?<scope>pr|branch|commit|local|codebase)-(?<provider>[a-z]+)-(?<timestamp>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.md$/;

export interface ParsedReportFileName {
  readonly repository: string;
  readonly scope: string;
  readonly provider: ReportProvider;
  /** The instant the review ran, in ISO format. */
  readonly startedAt: string;
  /** The timestamp exactly as written into the file name; used to build run ids. */
  readonly timestamp: string;
}

export interface ReviewRunReport {
  readonly provider: ReportProvider;
  readonly path: string;
}

export interface ReviewRun {
  /** URL-safe key derived from repository, scope, and file-name timestamp. */
  readonly id: string;
  readonly repository: string;
  readonly scope: string;
  readonly startedAt: string;
  readonly reports: readonly ReviewRunReport[];
}

export interface RunReportContent {
  readonly provider: ReportProvider;
  readonly markdown: string;
}

/**
 * Parses an artifact file name written by `persistRawReview`. Returns
 * `undefined` for everything else: combined `-both-` files (they duplicate the
 * per-provider reports), unrelated Markdown, and malformed names.
 */
export function parseReportFileName(fileName: string): ParsedReportFileName | undefined {
  const match = REPORT_FILE_NAME.exec(fileName);
  const groups = match?.groups;
  if (groups === undefined) return undefined;
  const repository = groups["repository"];
  const scope = groups["scope"];
  const timestamp = groups["timestamp"];
  if (repository === undefined || scope === undefined || timestamp === undefined) return undefined;
  const provider = PROVIDER_LABELS.find((label) => label.toLowerCase() === groups["provider"]);
  const startedAt = fileNameTimestampToInstant(timestamp);
  if (provider === undefined || startedAt === undefined) return undefined;
  return { repository, scope, provider, startedAt, timestamp };
}

/**
 * Reads every review run in the artifact directory, newest first. Reports are
 * grouped into one run per repository, scope, and review instant. A missing
 * directory means no review has run yet and yields an empty list; every other
 * read failure is reported to the caller.
 */
export async function readReviewRuns(artifactDirectory: string): Promise<readonly ReviewRun[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(artifactDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectory(error)) return [];
    throw error;
  }

  const grouped = new Map<string, ReviewRun>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parsed = parseReportFileName(entry.name);
    if (parsed === undefined) continue;
    const id = `${parsed.repository}-${parsed.scope}-${parsed.timestamp}`;
    const existing = grouped.get(id);
    const reports = existing === undefined ? [] : [...existing.reports];
    reports.push({ provider: parsed.provider, path: path.join(artifactDirectory, entry.name) });
    grouped.set(id, {
      id,
      repository: parsed.repository,
      scope: parsed.scope,
      startedAt: parsed.startedAt,
      reports: sortReports(reports),
    });
  }
  return [...grouped.values()].sort((first, second) => second.startedAt.localeCompare(first.startedAt));
}

/** Reads the verbatim Markdown of every report in the run, in provider order. */
export async function readRunReports(run: ReviewRun): Promise<readonly RunReportContent[]> {
  return Promise.all(
    run.reports.map(async (report) => ({ provider: report.provider, markdown: await readFile(report.path, "utf8") })),
  );
}

function sortReports(reports: readonly ReviewRunReport[]): readonly ReviewRunReport[] {
  return [...reports].sort(
    (first, second) => PROVIDER_LABELS.indexOf(first.provider) - PROVIDER_LABELS.indexOf(second.provider),
  );
}

/** Reverses the `[:.]` → `-` replacement `persistRawReview` applies to ISO timestamps. */
function fileNameTimestampToInstant(timestamp: string): string | undefined {
  const instant = timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  return Number.isFinite(Date.parse(instant)) ? instant : undefined;
}

function isMissingDirectory(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
