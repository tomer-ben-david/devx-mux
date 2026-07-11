import type { ReviewProtocol } from "../agent-profile.js";

export const deepCodeReviewProtocol: ReviewProtocol = {
  id: "deep-code-review",
  description: "A context-aware review that investigates impact and attempts to disprove every candidate finding.",
  instructions: `Independently investigate the selected change deeply enough to give a trustworthy review. Choose the repository tools, evidence, and exploration strategy you consider appropriate.

Judge correctness, user-visible behavior, security, data integrity, concurrency, failure behavior, structure, clarity, and maintainability wherever relevant. Look for simpler designs that remove complexity rather than rearrange it. Actively try to disprove candidate findings before reporting them. Prefer a small number of high-confidence findings over review theater, and approve a genuinely sound change.`,
};
