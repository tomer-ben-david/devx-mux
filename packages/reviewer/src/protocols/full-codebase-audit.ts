import type { ReviewProtocol } from "../agent-profile.js";

export const fullCodebaseAuditProtocol: ReviewProtocol = {
  id: "full-codebase-audit",
  description: "A repository-wide audit of architecture, representative flows, and high-risk implementation areas.",
  instructions: `Follow this repository-audit procedure:

1. Establish purpose. Read repository instructions and documentation to understand what the system promises to users.
2. Map the system. Identify entry points, packages, dependency direction, state owners, persistence boundaries, external integrations, and test strategy.
3. Find hotspots. Identify large, highly coupled, frequently changed, or failure-prone areas using the repository evidence you consider most useful. Do not read files in arbitrary order.
4. Trace representative flows. Follow the most important user and data flows end to end, including their failure and cancellation paths.
5. Audit invariants. Check correctness, security, data integrity, concurrency, lifecycle, configuration, and reproducibility where relevant.
6. Audit structure. Look for duplicated policy, unclear ownership, tangled state, leaky boundaries, accidental complexity, and abstractions that obscure rather than simplify.
7. Search for simplification. Identify concrete reframings that remove concepts or failure modes. Do not propose broad rewrites without a demonstrated payoff.
8. Falsify findings. Search for types, tests, callers, documentation, or configuration that disprove each candidate issue.
9. Control scope. Prefer a small set of important, well-supported findings. Do not turn incomplete coverage into confident claims, and state meaningful areas you could not verify.
10. Decide independently. Give an honest health assessment based on observed evidence, not repository size or stylistic preference.`,
};
