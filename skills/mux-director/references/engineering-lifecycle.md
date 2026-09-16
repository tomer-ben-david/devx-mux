# Engineering evidence and decisions

Use the engineering discipline of `mux-ai-engineer-workflow` within the director's existing orchestration. The implementor investigates, designs, implements, and verifies; the director checks consequential claims and routes unsettled decisions. Preserve the current stage, scope contract, accepted decisions, and repair-family history when joining ongoing work. Use the existing live report and steering artifact, not a second workflow or approval checklist.

## Match evidence to the work

| Work | Evidence before the next consequential step |
| --- | --- |
| Bug | Expected versus observed behavior, reproduction, execution path, relevant readers/writers, and violated invariant |
| Feature | User capability, concrete before/after scenario, existing domain concepts and precedent, boundaries, and acceptance criteria |
| Refactor | Concrete maintenance problem, behavior to preserve, and checks that can detect an unintended behavior change |
| Performance | Measured bottleneck, correctness constraints, and comparable before/after measurements |

A feature does not need an invented root cause. An obvious small change does not need a design ceremony. Break substantial work into coherent slices with observable results and checks; compare each result to the stable contract before assigning more work.

Classify material claims as confirmed, inferred, or unknown. Check raw code, logs, data, or test output at the exact checkout/head and relevant runtime/data source. An agent's summary, several agreeing reviewers, or an intermediate API value does not establish what the user sees after filtering or transformation. For a disputed cause, identify an observation that distinguishes it from another plausible explanation. If it is unavailable, state the gap and continue independent investigation; do not send a speculative fix as a proven diagnosis.

## Challenge design before expensive implementation

Find the existing owner and a comparable implementation before creating new structure. For proposed persistence, identify ownership, lifecycle, readers/writers, and why existing facts cannot represent or derive the required behavior. Apply the same questions to new caches, services, flags, and compatibility paths. Prefer the smallest coherent design that establishes the invariant at its owner; neither minimum line count nor a speculative platform is the objective.

For a consequential design, ask what would disprove it: supported negative cases, hidden behavior changes, unnecessary concepts, or a simpler approach meeting the same contract. Use the already selected investigator/reviewer roles when appropriate; otherwise label the director's own assessment as self-review. Do not add more agents simply because a workflow stage exists.

Send the implementor the settled contract and evidence, with the level of planning the task requires. Keep proposed choices distinct from accepted decisions. The main skill's decision-routing and delegated-authority rules determine who may resolve an unsettled choice. A proposed prerequisite that crosses a non-goal needs a scope decision before dependent implementation.

## Preserve correction history without turning it into policy

Keep failed attempts in the existing repair-family ledger. The main skill's structural-reset rules govern when editing pauses; do not start a competing counter or erase history at handoff. A reset must change the evidence or justified decision before another attempt, not just the wording of the plan.

When a substantial human correction exposes a reusable failure, capture:

- What the agent concluded or changed, and why that reasoning failed.
- The evidence or judgment that corrected it, with its applicability limits.
- The earliest useful check next time and where it belongs: a behavioral test, static check, narrow repository instruction, review cue, or human decision.

At handoff, propose exact wording for lessons worth retaining. Do not save permanent instructions, skill edits, or global memories without authorization. A current task correction should steer current work immediately; permanent policy needs its own review. On later tasks, consult relevant accepted lessons and recheck facts that may have changed. Judge improvement by fewer repeated corrections and demonstrated outcomes, not review count or code volume.
