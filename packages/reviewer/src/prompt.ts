import type { ReviewRequest, ReviewScope } from "./types.js";
import { deepCodeReviewProtocol } from "./protocols/deep-code-review.js";
import { exactingEngineerPersona } from "./personas/exacting-engineer.js";
import { reviewerRole } from "./roles/reviewer.js";

const FINDING_CONTRACT = `Every finding must:
- identify a concrete file and line or the smallest relevant code area;
- describe a realistic failure or maintenance cost;
- explain why the selected change introduces it;
- cite the evidence that makes the finding high-confidence;
- recommend the smallest durable correction.

Do not report generic advice, speculative edge cases, defensive-catch requests, fallback requests without a required degraded mode, style-only nits, or issues that are already caught clearly by routine compiler, formatter, or linter output.

If there are no actionable issues, say "No actionable findings."`;

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

  return `# Role: ${reviewerRole.id}

${reviewerRole.instructions}

# Persona: ${exactingEngineerPersona.id}

${exactingEngineerPersona.instructions}

# Protocol: ${deepCodeReviewProtocol.id}

${deepCodeReviewProtocol.instructions}

# Finding contract

${FINDING_CONTRACT}

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

## Output

1. Goal and non-goals
2. Findings ordered by P1, P2, P3. Include file or area, consequence, evidence, and durable correction. If none, write "No actionable findings."
3. What went well, limited to decisions that materially improved correctness or structure
4. Residual risks or verification gaps, if any
5. Merge confidence: yes, medium, or no
`;
}
