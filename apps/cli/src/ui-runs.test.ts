import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseReportFileName, readReviewRuns, readRunReports } from "./ui-runs.js";

function makeArtifactDirectory(files: readonly string[]): string {
  const directory = mkdtempSync(path.join(tmpdir(), "devx-mux-ui-runs-"));
  for (const file of files) {
    writeFileSync(path.join(directory, file), `# report ${file}\n`, { encoding: "utf8" });
  }
  return directory;
}

test("parses a report file name written by persistRawReview", () => {
  assert.deepEqual(parseReportFileName("devx-mux-ui-branch-codex-2026-11-28T15-16-32-123Z.md"), {
    repository: "devx-mux-ui",
    scope: "branch",
    provider: "Codex",
    startedAt: "2026-11-28T15:16:32.123Z",
    timestamp: "2026-11-28T15-16-32-123Z",
  });
});

test("parses every report provider and scope", () => {
  assert.equal(parseReportFileName("app-pr-grok-2026-01-02T03-04-05-006Z.md")?.provider, "Grok");
  assert.equal(parseReportFileName("app-pr-grok-2026-01-02T03-04-05-006Z.md")?.scope, "pr");
  assert.equal(parseReportFileName("app-codebase-verifier-2026-01-02T03-04-05-006Z.md")?.provider, "Verifier");
  assert.equal(parseReportFileName("app-local-codex-2026-01-02T03-04-05-006Z.md")?.scope, "local");
  assert.equal(parseReportFileName("app-commit-grok-2026-01-02T03-04-05-006Z.md")?.scope, "commit");
  assert.equal(parseReportFileName("app-codebase-codex-2026-01-02T03-04-05-006Z.md")?.scope, "codebase");
});

test("rejects names that are not per-provider review artifacts", () => {
  assert.equal(parseReportFileName("app-branch-both-2026-01-02T03-04-05-006Z.md"), undefined);
  assert.equal(parseReportFileName("notes.md"), undefined);
  assert.equal(parseReportFileName("app-branch-grok.md"), undefined);
  assert.equal(parseReportFileName("app-holiday-codex-2026-01-02T03-04-05-006Z.md"), undefined);
  assert.equal(parseReportFileName("app-branch-grok-not-a-timestamp.md"), undefined);
  assert.equal(parseReportFileName("app-branch-codex-2026-99-99T03-04-05-006Z.md"), undefined);
});

test("groups reports into one run per repository, scope, and instant, newest first", async () => {
  const directory = makeArtifactDirectory([
    "alpha-branch-codex-2026-11-28T10-00-00-000Z.md",
    "alpha-branch-grok-2026-11-28T10-00-00-000Z.md",
    "alpha-pr-grok-2026-11-28T11-30-00-250Z.md",
    "beta-local-codex-2026-11-27T09-00-00-000Z.md",
  ]);
  try {
    const runs = await readReviewRuns(directory);

    assert.deepEqual(
      runs.map((run) => `${run.repository} ${run.scope} ${run.startedAt}`),
      ["alpha pr 2026-11-28T11:30:00.250Z", "alpha branch 2026-11-28T10:00:00.000Z", "beta local 2026-11-27T09:00:00.000Z"],
    );
    assert.deepEqual(
      runs[1]?.reports.map((report) => report.provider),
      ["Codex", "Grok"],
    );
    assert.equal(runs[0]?.reports.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("orders the reports of a run as Codex, Grok, Verifier", async () => {
  const directory = makeArtifactDirectory([
    "alpha-branch-verifier-2026-11-28T10-00-00-000Z.md",
    "alpha-branch-grok-2026-11-28T10-00-00-000Z.md",
    "alpha-branch-codex-2026-11-28T10-00-00-000Z.md",
  ]);
  try {
    const [run] = await readReviewRuns(directory);
    assert.deepEqual(run?.reports.map((report) => report.provider), ["Codex", "Grok", "Verifier"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ignores combined reports, unrelated files, and directories", async () => {
  const directory = makeArtifactDirectory([
    "alpha-branch-codex-2026-11-28T10-00-00-000Z.md",
    "alpha-branch-both-2026-11-28T10-00-00-000Z.md",
    "notes.md",
  ]);
  mkdirSync(path.join(directory, "alpha-branch-grok-2026-11-28T10-00-00-000Z.md"));
  try {
    const runs = await readReviewRuns(directory);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]?.reports.map((report) => report.provider), ["Codex"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a missing artifact directory means no runs yet", async () => {
  assert.deepEqual(await readReviewRuns(path.join(tmpdir(), "devx-mux-ui-runs-missing")), []);
});

test("reads the verbatim markdown of every report in provider order", async () => {
  const directory = makeArtifactDirectory([
    "alpha-branch-grok-2026-11-28T10-00-00-000Z.md",
    "alpha-branch-codex-2026-11-28T10-00-00-000Z.md",
  ]);
  try {
    const [run] = await readReviewRuns(directory);
    assert(run !== undefined);
    const reports = await readRunReports(run);
    assert.deepEqual(
      reports.map((report) => `${report.provider}: ${report.markdown.trim()}`),
      ["Codex: # report alpha-branch-codex-2026-11-28T10-00-00-000Z.md", "Grok: # report alpha-branch-grok-2026-11-28T10-00-00-000Z.md"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
