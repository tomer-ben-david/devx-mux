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

Do not report generic advice, speculative edge cases, defensive-catch requests, fallback requests without a required degraded mode, style-only nits, or issues that are already caught clearly by routine compiler, formatter, or linter output.

If there are no actionable issues, say "No actionable findings."`;
}

function scopeInstructions(scope: ReviewScope): string {
  switch (scope.kind) {
    case "branch":
      return `Review the branch-introduced diff using the merge base with ${scope.base}. Use git diff ${scope.base}...HEAD.`;
    case "commit":
      return `Review commit ${scope.ref} only. Use git show --find-renames ${scope.ref}.`;
    case "local":
      return "Review staged, unstaged, and untracked working-tree changes. Inspect git diff, git diff --staged, and untracked files reported by git status.";
    case "codebase":
      return "Audit the entire repository at HEAD. This is not a diff review: existing high-confidence issues are in scope. Map the architecture before selecting representative and high-risk areas to inspect deeply.";
  }
}

export function buildReviewPrompt(request: ReviewRequest): string {
  const protocol = request.scope.kind === "codebase" ? fullCodebaseAuditProtocol : deepCodeReviewProtocol;
  const instructionFiles = request.repositoryInstructions.length > 0
    ? request.repositoryInstructions.map((path) => `- ${path}`).join("\n")
    : "- No repository instruction files were discovered.";

  return `# Role: ${reviewerRole.id}

${reviewerRole.instructions}

# Persona: ${exactingEngineerPersona.id}

${exactingEngineerPersona.instructions}

# Protocol: ${protocol.id}

${protocol.instructions}

# Finding contract

${findingContract(request.scope)}

Repository: ${request.repositoryName}
Repository path: ${request.repositoryPath}
HEAD: ${request.head}

## Scope

${scopeInstructions(request.scope)}

${request.scope.kind === "codebase" ? "Existing issues are in scope. State important areas that were not verified." : "Do not report pre-existing issues outside that scope."}

## Required context

Read these repository instructions before reviewing:
${instructionFiles}

Read the coding standards fully before reviewing:
- ${request.standardsReference}

${request.scope.kind === "codebase"
    ? "State the repository purpose you inferred from its documentation and implementation."
    : "When the repository or PR states a goal and non-goals, restate them and honor them. If they are absent, infer the narrow goal from the diff and say that it is inferred."}

## Output

1. Goal and non-goals
2. Findings ordered by P1, P2, P3. Include file or area, consequence, evidence, and durable correction. If none, write "No actionable findings."
3. What went well, limited to decisions that materially improved correctness or structure
4. Residual risks or verification gaps, if any
5. ${request.scope.kind === "codebase" ? "Repository health: strong, mixed, or at risk" : "Merge confidence: yes, medium, or no"}
`;
}
