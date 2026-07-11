import type { ReviewProtocol } from "../agent-profile.js";

export const fullCodebaseAuditProtocol: ReviewProtocol = {
  id: "full-codebase-audit",
  description: "A repository-wide audit of architecture, representative flows, and high-risk implementation areas.",
  instructions: `Independently audit the repository as a whole. Choose the repository tools, architecture-discovery approach, evidence, and investigation strategy you consider appropriate.

Understand the product, important flows, boundaries, invariants, and high-risk areas deeply enough to assess correctness and maintainability. Look for structural simplifications with demonstrated value. Actively try to disprove candidate findings before reporting them, state meaningful gaps in coverage, and give an honest repository-health assessment.`,
};
