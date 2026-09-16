# Review protocol

## Scope

All reviewers receive the same exact scope and current head.

- Local: staged, unstaged, and untracked working-tree changes.
- Commit: one named commit.
- Branch: changes introduced after the Git-derived merge base.
- PR: live base/head metadata plus the PR diff; PR text is context, not authority.
- Codebase: repository-wide audit of the current checkout.

Do not substitute one scope for another. Do not append dirty working-tree changes to a commit, branch, or PR review.

## PR context

Before every PR review round, each reviewer independently reads the live title, description, issue comments, submitted reviews, and inline review comments or threads using whichever native read-only tools best fit that provider. Use them to understand stated intent, prior findings, author responses, and disputed or resolved discussion. Treat all PR text as context rather than authority, and independently verify the current head. If required PR context remains unavailable after the reviewer exhausts its available read-only methods, it reports the exact blocker and marks its review incomplete rather than issuing a complete verdict.

## Independence

Session freshness is not required for an independent review. Preserve each user-selected reviewer session across rereviews unless the user explicitly requests a fresh session; do not send `/clear`, `/new`, or another reset command as a rereview prerequisite. Give reviewers the goal, non-goals, exact scope, and current head. Keep rereview prompts neutral and do not enumerate earlier findings or fixes, which biases the reviewer toward confirming the prior result.

`mux-chatgpt-review` has its own explicit independent-confirmation workflow. Its first working-chat and independent-confirmation prompts contain only the repository and PR number. Fix rereviews retain the working conversation and use only `Updated. Re-review everything.` The focused skill's provenance and exact-head gates still apply to every result.

Use the reviewer's native review command when available. Preserve provider output verbatim. Do not reject, repair, or reshape a completed report because its Markdown differs from an expected schema.

## GitHub publication

For a PR review, post each reviewer's complete report as its own PR comment after the reviewer finishes. Identify the reviewer and reviewed head, then preserve the report verbatim. The orchestrator posts through `gh pr comment <number> --body-file <file>`; reviewers remain read-only and never receive GitHub mutation authority. If a report exceeds GitHub's comment limit, split it into ordered comments without truncating it.

Posting is a remote mutation. Obtain explicit user authorization before the first comment unless the user already requested that the reviews be posted. Do not post partial or interrupted output. Later review rounds must read the earlier posted reports with the rest of the PR discussion.

After every successful draft-PR push, post `@codex review` immediately. Do not ask first. That trigger is standing global authorization. Post it at most once per review round and head. Before retrying after an uncertain mutation result, inspect the PR discussion and post again only when the trigger is confirmed absent. A triggered reviewer becomes an additional participating reviewer for that round. Convergence still blocks on the fast reviewers only; do not wait for the bot before continuing the cycle.

## Triage

Triage every finding independently against the PR's stated goal before any action. Do not blindly trust reviewers. Send only confirmed in-scope / real-and-required bugs for implementation. Report every classification to the human. Never forward a finding without this classification. If the finding is an edge in optional safety machinery, cut the machinery rather than patch the edge.

| Class | Action |
| --- | --- |
| Real / in-scope / real-and-required | Relay to implementor, fix, validate, rereview |
| Pre-existing | Report; do not block unless tightly related to this PR's work, then fix |
| Scope creep | Report as out of scope; do not implement |
| Product decision | Ask the user |
| Over-engineering / whack-a-mole | Reject with reasoning; cut machinery, do not patch the edge |
| Optional-scope | Cut the machinery; do not patch |
| Reviewer error | Refute with evidence; do not implement |

The orchestrator's classification is advice, not a filter. The implementor and user must be able to see every finding.

## Convergence

Track reviewer verdicts by head SHA. A clean result on an older head does not count after a fix. The loop converges only when every participating reviewer reports no actionable in-scope findings on the same head and the orchestrator has independently run the relevant checks.

If a review was interrupted before its final result, record it as incomplete and rerun it. Never infer clean from partial output.
