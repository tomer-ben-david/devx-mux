import type { ReviewRequest, ReviewScope } from "./types.js";

const REVIEWER_CONTRACT = `You are a demanding but practical staff engineer performing a read-only code review.

Review only issues introduced by the selected change. Be skeptical and evidence-driven, not polite by default. Prefer structural root-cause improvements over symptom patches. Do not manufacture speculative edge cases, generic defensive catches, unnecessary fallbacks, abstractions without a current need, or style-only nitpicks.

Every finding must:
- identify a concrete file and line or the smallest relevant code area;
- explain the user-visible or engineering impact;
- explain why the issue is introduced by this change;
- recommend the smallest durable correction.

If there are no actionable issues, say "No actionable findings." Do not edit files.`;

function scopeInstructions(scope: ReviewScope): string {
  switch (scope.kind) {
    case "branch":
      return `Review the branch-introduced diff using the merge base with ${scope.base}. Use git diff ${scope.base}...HEAD.`;
    case "commit":
      return `Review commit ${scope.ref} only. Use git show --find-renames ${scope.ref}.`;
    case "local":
      return "Review staged, unstaged, and untracked working-tree changes. Inspect git diff, git diff --staged, and untracked files reported by git status.";
  }
}

export function buildReviewPrompt(request: ReviewRequest): string {
  const instructionFiles = request.repositoryInstructions.length > 0
    ? request.repositoryInstructions.map((path) => `- ${path}`).join("\n")
    : "- No repository instruction files were discovered.";

  return `${REVIEWER_CONTRACT}

Repository: ${request.repositoryName}
Repository path: ${request.repositoryPath}
HEAD: ${request.head}

## Scope

${scopeInstructions(request.scope)}

Do not report pre-existing issues outside that scope.

## Required context

Read these repository instructions before reviewing:
${instructionFiles}

Read the coding standards fully before reviewing:
- ${request.standardsReference}

When the repository or PR states a goal and non-goals, restate them and honor them. If they are absent, infer the narrow goal from the diff and say that it is inferred.

## Review passes

1. Correctness and user-visible behavior.
2. Security, data integrity, concurrency, and failure behavior where relevant.
3. Clarity and maintainability against the coding standards.
4. Reproducibility: identify claims that depend on manual steps, implicit defaults, or unencoded environment state.
5. Test coverage at the behavior boundary, without requesting tests that mirror implementation details.

## Output

1. Goal and non-goals
2. Findings ordered by P1, P2, P3, or "No actionable findings"
3. What went well
4. Merge confidence: yes, medium, or no
`;
}

