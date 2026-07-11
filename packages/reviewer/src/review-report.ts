export type ReviewStandardStatus = "PASS" | "FAIL" | "N/A";

export interface ReviewStandardResult {
  readonly item: string;
  readonly status: ReviewStandardStatus;
  readonly evidence: string;
}

export interface ReviewFinding {
  readonly severity: "P1" | "P2" | "P3";
  readonly title: string;
  readonly location: string;
  readonly consequence: string;
  readonly correction: string;
}

export interface ReviewReport {
  readonly markdown: string;
  readonly standards: readonly ReviewStandardResult[];
  readonly findings: readonly ReviewFinding[];
  readonly verificationGaps: readonly string[];
}

const REQUIRED_SECTIONS = [
  "Review target",
  "Standards checklist",
  "Findings",
  "What went well",
  "Verification gaps",
  "Summary",
] as const;

export function parseReviewReport(markdown: string): ReviewReport {
  const normalized = markdown.trim();
  if (normalized.length === 0) throw new Error("Provider returned an empty review report.");
  const lines = normalized.split(/\r?\n/);
  const sectionIndexes = REQUIRED_SECTIONS.map((section) => ({
    section,
    index: lines.findIndex((line) => new RegExp(`^##\\s+(?:\\d+\\.\\s*)?${section}\\s*$`, "i").test(line)),
  }));
  const missing = sectionIndexes.filter(({ index }) => index < 0).map(({ section }) => section);
  if (missing.length > 0) throw new Error(`Provider returned an incomplete review. Missing sections: ${missing.join(", ")}.`);
  if (sectionIndexes.some((entry, index) => index > 0 && entry.index <= (sectionIndexes[index - 1]?.index ?? -1))) {
    throw new Error("Provider returned review sections in the wrong order.");
  }

  const standards = lines.flatMap((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const status = cells[1];
    if (cells.length < 3 || (status !== "PASS" && status !== "FAIL" && status !== "N/A")) return [];
    return [{ item: plain(cells[0] ?? ""), status: status as ReviewStandardStatus, evidence: plain(cells.slice(2).join(" | ")) }];
  });
  if (standards.length === 0) throw new Error("Provider returned a review without any standards results.");

  const findingsSection = sectionBody(lines, sectionIndexes, "Findings");
  const findings = findingsSection.flatMap((line, index) => {
    const match = line.match(/^###\s+(P[123])(?:\s+\d+[.:])?\s*(.+)$/);
    if (match === null) return [];
    const nextHeading = findingsSection.findIndex((candidate, bodyIndex) => bodyIndex > index && /^###\s/.test(candidate));
    const body = findingsSection.slice(index + 1, nextHeading === -1 ? findingsSection.length : nextHeading);
    return [{
      severity: match[1] as "P1" | "P2" | "P3",
      title: plain(match[2] ?? "Finding"),
      location: field(body, "Location"),
      consequence: field(body, "Consequence"),
      correction: field(body, "Durable correction"),
    }];
  });
  if (findings.length === 0 && !findingsSection.some((line) => /No actionable findings\./i.test(line))) {
    throw new Error('Provider returned an invalid findings section. Expected P1/P2/P3 findings or "No actionable findings."');
  }
  const incompleteFinding = findings.find((finding) =>
    finding.location.length === 0 || finding.consequence.length === 0 || finding.correction.length === 0,
  );
  if (incompleteFinding !== undefined) throw new Error(`Provider returned an incomplete ${incompleteFinding.severity} finding: ${incompleteFinding.title}.`);

  const verificationGaps = sectionBody(lines, sectionIndexes, "Verification gaps")
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => plain(line.replace(/^[-*]\s+/, "")));
  return { markdown: normalized, standards, findings, verificationGaps };
}

function sectionBody(
  lines: readonly string[],
  sections: readonly { readonly section: string; readonly index: number }[],
  name: string,
): readonly string[] {
  const position = sections.findIndex(({ section }) => section === name);
  const start = (sections[position]?.index ?? -1) + 1;
  const end = sections[position + 1]?.index ?? lines.length;
  return lines.slice(start, end);
}

function field(lines: readonly string[], name: string): string {
  const index = lines.findIndex((line) => new RegExp(`^\\*\\*${name}:\\*\\*`).test(line));
  if (index < 0) return "";
  const valueLines = [lines[index] ?? ""];
  for (const line of lines.slice(index + 1)) {
    if (line.trim().length === 0 || /^\*\*[^*]+:\*\*/.test(line)) break;
    valueLines.push(line);
  }
  return plain(valueLines.join(" ").replace(new RegExp(`^\\*\\*${name}:\\*\\*\\s*`), ""));
}

function plain(markdown: string): string {
  return markdown.replace(/\[([^\]]+)]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();
}
