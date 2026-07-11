import assert from "node:assert/strict";
import test from "node:test";
import { parseReviewReport } from "./review-report.js";

const validReport = `## 1. Review target
Purpose and scope.

## 2. Standards checklist
| Item | Status | Evidence |
| --- | --- | --- |
| Types | PASS | Explicit |
| Output | FAIL | See P2 1 |

## 3. Findings
### P2 1. Validate provider output
**Location:** main.ts:74
**Consequence:** Invalid output can look successful.
**Evidence:** Only non-empty text is required.
**Durable correction:** Parse and validate the report once.

## 4. What went well
- Clear provider boundary.

## 5. Verification gaps
- Windows was not exercised.

## 6. Summary
P1: 0 · P2: 1 · P3: 0`;

test("parses one validated review report model", () => {
  const report = parseReviewReport(validReport);

  assert.equal(report.standards.length, 2);
  assert.deepEqual(report.findings[0], {
    severity: "P2",
    title: "Validate provider output",
    location: "main.ts:74",
    consequence: "Invalid output can look successful.",
    correction: "Parse and validate the report once.",
  });
  assert.deepEqual(report.verificationGaps, ["Windows was not exercised."]);
});

test("rejects a report with a missing required section", () => {
  assert.throws(() => parseReviewReport(validReport.replace("## 6. Summary", "## Conclusion")), /Missing sections: Summary/);
});

test("rejects a report with an incomplete finding", () => {
  assert.throws(() => parseReviewReport(validReport.replace("**Durable correction:** Parse and validate the report once.\n", "")), /incomplete P2 finding/);
});
