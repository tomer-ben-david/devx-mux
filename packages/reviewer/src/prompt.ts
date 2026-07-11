import type { ReviewRequest, ReviewScope } from "./types.js";
import { deepCodeReviewProtocol } from "./protocols/deep-code-review.js";
import { fullCodebaseAuditProtocol } from "./protocols/full-codebase-audit.js";
import { exactingEngineerPersona } from "./personas/exacting-engineer.js";
import { reviewerRole } from "./roles/reviewer.js";

function findingContract(scope: ReviewScope): string {
  const provenance = scope.kind === "codebase"
    ? "show where the issue exists and which important flow or invariant it affects;"
    : "explain why the selected change introduces it;";

  return `Every finding must:
- identify a concrete file and line or the smallest relevant code area;
- describe a realistic failure or maintenance cost;
- ${provenance}
- cite the evidence that makes the finding high-confidence;
- recommend the smallest durable correction.

If there are no actionable issues, say "No actionable findings."`;
}

function scopeInstructions(scope: ReviewScope): string {
  switch (scope.kind) {
    case "pr":
      return `Review pull request ${scope.number ?? "for the current branch"} relative to ${scope.base}. Before inspecting the diff, use the repository's read-only PR tooling to read its title and description. Briefly report that PR-context step in live progress, then independently review the change with that context. If PR metadata is unavailable, state that as a verification gap.`;
    case "branch":
      return `Review the current branch changes relative to ${scope.base}.`;
    case "commit":
      return `Review commit ${scope.ref} only.`;
    case "local":
      return "Review the staged, unstaged, and untracked working-tree changes.";
    case "codebase":
      return "Audit the entire current repository state, including tracked local modifications. This is not a diff review: existing high-confidence issues are in scope.";
  }
}

export function buildReviewPrompt(request: ReviewRequest): string {
  const protocol = request.scope.kind === "codebase" ? fullCodebaseAuditProtocol : deepCodeReviewProtocol;
  return `# Role: ${reviewerRole.id}

${reviewerRole.instructions}

# Persona: ${exactingEngineerPersona.id}

${exactingEngineerPersona.instructions}

# Protocol: ${protocol.id}

${protocol.instructions}

# Finding contract

${findingContract(request.scope)}

## Scope

${scopeInstructions(request.scope)}

${request.scope.kind === "codebase" ? "Existing issues are in scope. State important areas that were not verified." : "Do not report pre-existing issues outside that scope."}

Honor the repository's own guidance and review against the DevX coding standards at ${request.standardsReference}.

Choose your own read-only repository tools and investigation strategy. DevX Crew defines the target and quality bar, not the commands you should run.

Review every named rule and check defined by the DevX coding standards, item by item. A top-level section summary is not a substitute for its individual rules. Do not silently skip sections or collapse multiple standards into a generic category. Report every item as PASS, FAIL, or N/A. Every FAIL must link to a P1/P2/P3 finding; every N/A must include a short reason.

${request.scope.kind === "codebase"
    ? "State the repository purpose you inferred from its documentation and implementation."
    : "When the repository or PR states a goal and non-goals, restate them and honor them. If they are absent, infer the narrow goal from the diff and say that it is inferred."}

## Output

Return concise Markdown using exactly these level-two headings in exactly this order:

## 1. Review target
Purpose, goal, and non-goals.

## 2. Standards checklist
A Markdown table with columns Item, Status, Evidence. Include one row for every applicable standards item or section. Status is exactly PASS, FAIL, or N/A.

## 3. Findings
Ordered P1, P2, P3. Each finding uses a level-three heading and includes bold Location, Consequence, Evidence, and Durable correction fields. If none, write "No actionable findings."

## 4. What went well
Only decisions that materially improved correctness or structure.

## 5. Verification gaps
Important areas you could not verify.

## 6. Summary
P1/P2/P3 counts and ${request.scope.kind === "codebase" ? "repository health: strong, mixed, or at risk" : "merge confidence: yes, medium, or no"}.
`;
}
