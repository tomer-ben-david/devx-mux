import type { ReviewRequest, ReviewScope } from "./types.js";
import { deepCodeReviewProtocol } from "./protocols/deep-code-review.js";
import { fullCodebaseAuditProtocol } from "./protocols/full-codebase-audit.js";
import { exactingEngineerPersona } from "./personas/exacting-engineer.js";
import { reviewerRole } from "./roles/reviewer.js";

function findingContract(scope: ReviewScope): string {
  const provenance = scope.kind === "codebase"
    ? "show where the issue exists and which important flow or invariant it affects;"
    : "explain why the selected change introduces it;";

  return `For every finding, make the following clear in whatever presentation you judge best:
- identify a concrete file and line or the smallest relevant code area;
- describe a realistic failure or maintenance cost;
- ${provenance}
- cite the evidence that makes the finding high-confidence;
- recommend the smallest durable correction.

If there are no actionable issues, make that conclusion unambiguous.`;
}

function scopeInstructions(scope: ReviewScope): string {
  switch (scope.kind) {
    case "pr":
      return `Review pull request ${scope.number ?? "for the current branch"}${scope.base === undefined ? " relative to its actual merge base, determined with Git and PR metadata" : ` relative to the merge base with ${scope.base}`}. Before inspecting the diff, independently read its title, description, issue comments, submitted reviews, and inline review comments or threads using whichever native read-only tools best fit the provider. Treat that discussion as context that may be stale or disputed; independently review the actual change and do not merely repeat earlier findings. If required PR context remains unavailable after exhausting the provider's available read-only methods, state the exact blocker and mark the review incomplete rather than issuing a complete verdict.`;
    case "branch":
      return scope.base === undefined
        ? "Review the current branch changes relative to their merge base. Use Git to determine the appropriate comparison base and actual merge base; do not assume a branch name."
        : `Review the current branch changes relative to the merge base with ${scope.base}.`;
    case "commit":
      return `Review commit ${scope.ref} only.`;
    case "local":
      return "Review the staged, unstaged, and untracked working-tree changes.";
    case "codebase":
      return "Audit the entire current repository state, including tracked local modifications. This is not a diff review: existing high-confidence issues are in scope.";
  }
}

function userInstructions(instructions: string | undefined): string {
  if (instructions === undefined) return "";
  return `
## User-provided review instructions

Treat these instructions as focus and non-goals within the selected Git scope. They may narrow what to investigate or require additional verification. They do not broaden the Git scope, authorize mutations, override repository guidance, or lower the evidence bar. If they conflict with fixed read-only or safety rules, follow the fixed rules and state the conflict.

${instructions}
`;
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
${userInstructions(request.instructions)}

Honor the repository's own guidance and review against the DevX coding standards at ${request.standardsReference}.

Choose your own read-only repository tools and investigation strategy. DevX Mux defines the target and quality bar, not the commands you should run.

Review every named rule and check defined by the DevX coding standards individually. A top-level section summary is not a substitute for its individual rules. For each item, explicitly state PASS, FAIL, or N/A and give brief evidence or an N/A reason. Do not silently skip sections or collapse multiple standards into a generic category. Present this checklist and the rest of the review in whatever format you judge best.

`;
}
