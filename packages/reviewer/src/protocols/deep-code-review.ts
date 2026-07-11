import type { ReviewProtocol } from "../agent-profile.js";

export const deepCodeReviewProtocol: ReviewProtocol = {
  id: "deep-code-review",
  description: "A context-aware review that investigates impact and attempts to disprove every candidate finding.",
  instructions: `Independently investigate the selected change deeply enough to give a trustworthy review. Choose the repository tools, evidence, and exploration strategy you consider appropriate.

Review phases:
1. Establish the selected scope, stated goal, and non-goals.
2. Understand the change and read the surrounding implementation needed for call sites, invariants, state, and failure boundaries.
3. Test the change mentally against correctness, user-visible behavior, security, data integrity, concurrency, cancellation, cleanup, portability, structure, clarity, and maintainability.
4. Look for structural simplifications that remove complexity rather than rearrange it.
5. Attempt to disprove every candidate finding with repository evidence.
6. Report only high-confidence actionable findings, or approve a genuinely sound change.`,
};
