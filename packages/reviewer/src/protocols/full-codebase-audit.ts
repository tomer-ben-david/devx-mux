import type { ReviewProtocol } from "../agent-profile.js";

export const fullCodebaseAuditProtocol: ReviewProtocol = {
  id: "full-codebase-audit",
  description: "A repository-wide audit of architecture, representative flows, and high-risk implementation areas.",
  instructions: `Independently audit the repository as a whole. Choose the repository tools, architecture-discovery approach, evidence, and investigation strategy you consider appropriate.

Audit phases:
1. Infer the product purpose, goals, boundaries, and important user-visible flows.
2. Map the architecture, ownership, state, external dependencies, and high-risk invariants.
3. Inspect representative implementations and failure paths deeply enough to test those invariants.
4. Evaluate every named DevX standard and search for structural simplifications with demonstrated value.
5. Attempt to disprove every candidate finding with repository evidence.
6. Report high-confidence findings, meaningful coverage gaps, and an honest repository-health assessment.`,
};
