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
      return `Review pull request ${scope.number ?? "for the current branch"}${scope.base === undefined ? " relative to its actual merge base, determined with Git and PR metadata" : ` relative to the merge base with ${scope.base}`}. Before inspecting the diff, use the repository's read-only PR tooling to read its title and description for context. The description may be stale; independently review the actual change. If PR metadata is unavailable, continue without it.`;
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

Choose your own read-only repository tools and investigation strategy. DevX Mux defines the target and quality bar, not the commands you should run.

Review every named rule and check defined by the DevX coding standards individually. A top-level section summary is not a substitute for its individual rules. For each item, explicitly state PASS, FAIL, or N/A and give brief evidence or an N/A reason. Do not silently skip sections or collapse multiple standards into a generic category. Present this checklist and the rest of the review in whatever format you judge best.

`;
}
