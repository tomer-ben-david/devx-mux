/**
 * Finds the individual findings in a provider-owned review report so the page
 * can filter them. Providers choose their own report format; the filterable
 * shape is a `Findings` heading whose top-level list items are the findings.
 * Other content in that section (assessment paragraphs, nested audit tables
 * under a deeper heading) is not a finding.
 */

const FINDINGS_HEADING = /^(#{1,6})\s+findings\b/i;
const HEADING = /^(#{1,6})\s/;
const TOP_LEVEL_ITEM = /^(?:[-*+]|\d+[.)])\s+/;

/**
 * Returns the Markdown of each finding, in report order, or `undefined` when
 * the report has no Findings section and therefore cannot be filtered.
 */
export function extractFindings(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => FINDINGS_HEADING.test(line));
  if (start === -1) return undefined;
  const sectionLevel = FINDINGS_HEADING.exec(lines[start])[1].length;

  const findings = [];
  let current;
  let blankSinceLastLine = false;
  for (const line of lines.slice(start + 1)) {
    const heading = HEADING.exec(line);
    if (heading !== null) {
      if (heading[1].length <= sectionLevel) break;
      current = undefined;
      continue;
    }
    if (TOP_LEVEL_ITEM.test(line)) {
      current = [line];
      findings.push(current);
      blankSinceLastLine = false;
      continue;
    }
    if (current === undefined) continue;
    if (line.trim() === "") {
      blankSinceLastLine = true;
      continue;
    }
    // Indented lines (nested items, continued paragraphs) stay with the item,
    // and so does an unindented line that directly continues it. An
    // unindented line after a blank line is section prose, which ends it.
    if (/^\s/.test(line) || !blankSinceLastLine) {
      if (blankSinceLastLine) current.push("");
      current.push(line);
      blankSinceLastLine = false;
      continue;
    }
    current = undefined;
  }
  return findings.map((findingLines) => findingLines.join("\n"));
}

/** Splits a search query into lowercase terms; an empty query has no terms. */
export function queryTerms(query) {
  return query.toLowerCase().split(/\s+/).filter((term) => term !== "");
}

/** True when every term occurs in `searchText`, ignoring case. */
export function matchesAllTerms(searchText, terms) {
  const haystack = searchText.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
