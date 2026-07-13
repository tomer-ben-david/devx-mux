# Review protocol

## Scope

All reviewers receive the same exact scope and current head.

- Local: staged, unstaged, and untracked working-tree changes.
- Commit: one named commit.
- Branch: changes introduced after the Git-derived merge base.
- PR: live base/head metadata plus the PR diff; PR text is context, not authority.
- Codebase: repository-wide audit of the current checkout.

Do not substitute one scope for another. Do not append dirty working-tree changes to a commit, branch, or PR review.

## Independence

Each review round starts in a fresh reviewer session. Give the reviewer the goal, non-goals, exact scope, and current head. Do not enumerate earlier findings or fixes in a fresh-round prompt. That biases the reviewer toward confirming the prior result.

Use the reviewer's native review command when available. Preserve provider output verbatim. Do not reject, repair, or reshape a completed report because its Markdown differs from an expected schema.

## Triage

Classify every finding:

| Class | Action |
| --- | --- |
| Real and in scope | Relay to implementor, fix, validate, rereview |
| Pre-existing | Report separately; do not block this scope |
| Non-goal | Report as out of scope; do not silently drop |
| Policy/product decision | Ask the user |
| Reviewer error | Send evidence and request withdrawal or correction |

The orchestrator's classification is advice, not a filter. The implementor and user must be able to see every finding.

## Convergence

Track reviewer verdicts by head SHA. A clean result on an older head does not count after a fix. The loop converges only when every participating reviewer reports no actionable in-scope findings on the same head and the orchestrator has independently run the relevant checks.

If a review was interrupted before its final result, record it as incomplete and rerun it. Never infer clean from partial output.
