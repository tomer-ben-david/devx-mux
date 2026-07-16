---
name: mux-pr-description
description: "Write or rewrite a GitHub PR title and reviewer-neutral description. Use for PR titles, PR bodies, reviewer context, or a description refresh before review. Produce clear Context, Related work, Goals, Non-goals, Solution, Next steps, Design notes, Verification, and an optional changelog."
---

# PR title and description

Write for a fresh reviewer. Explain the problem, scope, mechanics, and evidence without arguing for the implementation or directing the review.

## Draft and clarity pass

When an implementor and orchestrator are both available:

1. Ask the implementor to write the first complete draft from the current diff.
2. Have a fresh model rewrite it for clarity while preserving technical facts.
3. Remove unexplained internal labels, advocacy, and review instructions.

The implementor has the deepest change context. The fresh reader is better at finding jargon and missing background. Do not publish an implementor draft without the clarity pass.

## Gather current facts

- Read the actual diff, file list, commits, and existing PR body.
- Derive the problem, goal, key changes, boundaries, and verification from current repository state.
- Verify related PR numbers and states with `gh`; do not rely on memory.
- Read recent merged PR titles when repository naming conventions are unclear.
- Record honest limits on what tests or CI prove.

## Required structure

Use these exact section names because review workflows use Goals and Non-goals as the scope contract.

### Context

Explain what problem exists and why the PR is needed in one short paragraph. Ground project-specific terms in a concrete file, function, field, command, or data flow.

Bad: "Fix the resilient sync path."

Good: "Failed uploads were retried from process memory, so restarting the worker lost their position. This change persists the last acknowledged item before the worker advances."

### Related work

Include this section when the change belongs to a sequence. For three or more related PRs, use a table with:

| PR | Role | Status | Evidence |
| --- | --- | --- | --- |
| `#123` | Introduced the queue | Merged and enabled | 1,000-item fixture completed without retries |

State dependency direction and actual activation status, not only whether a PR merged. Omit the section for a standalone change.

### Goals

State what the PR accomplishes in one sentence or a tight list. This is the scope reviewers judge.

### Non-goals

List only meaningful boundaries, normally no more than five. Do not pad the section with obvious exclusions.

### Solution

Describe how the current diff achieves the goals. Summarize the major code, configuration, or data-flow changes and how they work together so a fresh reviewer can understand the implemented approach without opening the diff.

Keep this section concrete and reviewer-neutral. Name important files, functions, fields, commands, or boundaries when they clarify the mechanics. Do not turn it into a file-by-file changelog or argue that the approach is superior.

### Next steps

When later work remains, give the short ordered sequence and say what requires a separate action or approval. If the change is self-contained, say: "No follow-up; this PR is the complete change."

### Design notes

Use this optional section for implementation facts beyond the Solution summary:

- important invariants
- order of operations
- data flow
- limitations that shaped the implementation

State what the code does. Do not tell the reviewer what to check.

Bad: "Confirm the worker cannot acknowledge before persisting."

Good: "The worker persists the checkpoint before acknowledging the queue item."

### Verification

List the commands, tests, or manual checks that actually ran. State any meaningful gaps without implying that unrun verification passed.

## Reviewer neutrality

- Inform; do not argue.
- Do not add a "What to review" or "Focus areas" section.
- Do not pre-rebut alternatives with "Why X, not Y."
- Do not prescribe code checks or expected reviewer conclusions.
- Do not recap the implementation debate.
- Keep genuine open questions neutral and separate from asserted facts.

## Title

- Follow the repository's existing convention, including Conventional Commits when used.
- Name the concrete behavior or component.
- Mention both scopes when the PR genuinely spans two areas.
- Prefer `fix(sync): persist retry cursor before acknowledgement` over `improve reliability`.

## Changelog

When a PR description needs durable update history, place `## Changelog` at the bottom. Keep the sections above as current truth. Use a flat, newest-first list:

```markdown
## Changelog
- 2026-07-13: reject stale checkpoints - concurrent workers could otherwise move the cursor backward - in scope because checkpoint ordering is part of this PR's retry contract.
```

Capture what changed, why the team arrived there, and why it belongs in scope. Do not invent history or evidence.

## Remote editing

Drafting is local. Before changing a remote PR title or body, obtain explicit user confirmation.

After confirmation:

1. Write the body to a temporary file with real newlines.
2. Run `gh pr edit <number> --title "..." --body-file <file>`.
3. Fetch the PR body again with `gh pr view` and verify its rendered structure.

Do not encode the body as escaped `\n` sequences in a shell argument.

## Final check

- Context is understandable without recent chat history.
- Goals and Non-goals are present and accurate.
- Solution explains how the current diff achieves the goals.
- Related work and Next steps are included when applicable.
- Design notes state facts rather than review instructions.
- Verification says what ran and what remains unproven.
- The title is specific and follows repository convention.
- No private paths, credentials, customer names, internal URLs, or unrelated project details appear in the draft.
