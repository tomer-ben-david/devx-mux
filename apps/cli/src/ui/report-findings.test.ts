import assert from "node:assert/strict";
import test from "node:test";
import { extractFindings, matchesAllTerms, queryTerms } from "./report-findings.js";

// The shape of a real Codex report: findings are the top-level list items
// under `## Findings`, followed by section prose and a nested audit table.
const REPORT = `**Changes required.** Two P2 defects.

## Findings

1. **P2 · F1 — The mutation guard can forward an unapproved write.** [Guard](https://github.com/acme/app/blob/f22dca2/apps/cli/src/board/github-projects.ts#L147)
2. **P2 · F2 — Setup then add can create a draft.** [Add sequence](/Users/me/dev/projects/app/apps/cli/src/board/board-command.ts:109)
   - Validate the column before creating the card.
3. **P3 · F3 — The request seam leaves variables unchecked.**

**What worked well.** Removing the column rewrite.

### Guarantees and reuse audit

| Responsibility | Result |
|---|---|
| Refuse unapproved writes | **FAIL · F1** |

## DevX checklist

- General conventions: PASS
`;

test("extracts each top-level list item under the Findings heading as one finding", () => {
  const findings = extractFindings(REPORT);
  assert(findings !== undefined);
  assert.deepEqual(
    findings.map((finding) => finding.split("\n")[0]?.slice(0, 13)),
    ["1. **P2 · F1 ", "2. **P2 · F2 ", "3. **P3 · F3 "],
  );
  assert.match(findings[1] ?? "", /\n {3}- Validate the column before creating the card\.$/);
});

test("section prose, nested audit tables, and later sections are not findings", () => {
  const findings = extractFindings(REPORT) ?? [];
  const joined = findings.join("\n");
  assert.doesNotMatch(joined, /What worked well/);
  assert.doesNotMatch(joined, /Refuse unapproved writes/);
  assert.doesNotMatch(joined, /General conventions/);
});

test("a report without a Findings section cannot be filtered", () => {
  assert.equal(extractFindings("## Verdicts\n\n- F1: CONFIRMED at apps/x.ts:3\n"), undefined);
});

test("a Findings section without list items has no findings", () => {
  assert.deepEqual(extractFindings("## Findings\n\nNone. The change is sound.\n\n## Checklist\n"), []);
});

test("every query term must match the finding, ignoring case and extra spaces", () => {
  const terms = queryTerms("  Codex   GITHUB-projects.ts ");
  assert.deepEqual(terms, ["codex", "github-projects.ts"]);
  const finding = "Codex 1. **P2 · F1** [Guard](https://github.com/acme/app/blob/f22dca2/apps/cli/src/board/github-projects.ts#L147)";
  assert.equal(matchesAllTerms(finding, terms), true);
  assert.equal(matchesAllTerms(finding, queryTerms("grok github-projects.ts")), false);
  assert.deepEqual(queryTerms("   "), []);
});
