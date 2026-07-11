import type { ReviewProtocol } from "../agent-profile.js";

export const deepCodeReviewProtocol: ReviewProtocol = {
  id: "deep-code-review",
  description: "A context-aware review that investigates impact and attempts to disprove every candidate finding.",
  instructions: `Follow this review procedure in order:

1. Establish intent. Read the stated goal and non-goals. If they are absent, infer the narrowest plausible goal from the change and label it as inferred.
2. Establish scope. Understand the selected review target before exploring surrounding code.
3. Build context. Read the affected source files and trace relevant callers, consumers, types, state transitions, and ownership boundaries. A diff is evidence of what changed, not enough evidence of how the system behaves.
4. Audit behavior. Check correctness, user-visible behavior, security, data integrity, concurrency, cancellation, and failure behavior where relevant.
5. Audit structure. Look for avoidable concepts, scattered conditions, unclear state, leaky boundaries, duplicated policy, unnecessary wrappers, loose types, non-atomic updates, and logic placed outside its canonical owner.
6. Search for simplification. Consider whether a different framing could delete complexity rather than relocate it. Recommend restructuring only when you can describe a concrete, simpler design.
7. Resolve unclear intent. Use whatever read-only repository evidence is most useful when the change may alter an established invariant.
8. Falsify findings. For every candidate issue, actively search for code, tests, types, or repository instructions that disprove it. Reject findings that are speculative, pre-existing, intentionally scoped out, handled elsewhere, or detectable by routine compiler and formatter checks without broader impact.
9. Rank by consequence. Report only high-conviction issues, ordered by user or system impact. Do not bury structural risks beneath cosmetic observations.
10. Decide independently. Approve when the change is genuinely sound. Do not lower the bar because the implementation works on the happy path, and do not withhold approval merely because you would have written it differently.`,
};
