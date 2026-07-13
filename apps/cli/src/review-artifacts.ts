import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { reviewArtifactDirectory } from "./artifacts.js";

export interface ProviderIdentity {
  readonly label: string;
  readonly version: string;
  readonly model: string;
  readonly reasoning?: string;
}

export async function persistRawReview(repositoryPath: string, scopeKind: string, provider: string, markdown: string): Promise<string> {
  const directory = reviewArtifactDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(directory, `${path.basename(repositoryPath)}-${scopeKind}-${provider.toLowerCase()}-${timestamp}.md`);
  await writeFile(reportPath, markdown, { encoding: "utf8", mode: 0o600 });
  return reportPath;
}

export async function persistCombinedReview(
  repositoryPath: string,
  scopeKind: string,
  codexReportPath: string,
  grokReportPath: string,
  codexMarkdown: string,
  grokMarkdown: string,
): Promise<{ readonly path: string; readonly markdown: string }> {
  const directory = reviewArtifactDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const combinedPath = path.join(directory, `${path.basename(repositoryPath)}-${scopeKind}-both-${timestamp}.md`);
  const markdown = `# DevX Mux multireview\n\nCodex and Grok reviewed the same scope independently and concurrently. Their output is preserved verbatim.\n\n## Codex\n\n${codexMarkdown}\n\n## Grok\n\n${grokMarkdown}\n\n## Artifacts\n\n- Codex: ${codexReportPath}\n- Grok: ${grokReportPath}\n- Combined: ${combinedPath}\n`;
  await writeFile(combinedPath, markdown, { encoding: "utf8", mode: 0o600 });
  return { path: combinedPath, markdown };
}
