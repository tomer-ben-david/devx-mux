---
name: mux-pr-description
description: "Write or rewrite GitHub PR titles and descriptions so a fresh reviewer understands the intended outcome, scope, implemented solution, and evidence. Use when authoring or refreshing a PR title or body."
---

# PR title and description

Help a fresh reviewer understand why the PR exists, what it aims to achieve, what the current diff does, and what the evidence proves. Choose the structure, length, wording, and visuals that best communicate this change. Follow the user's preferred format and repository conventions.

## Desired result

- **Title:** communicates the intended outcome in recognizable terms. Prefer what the change achieves over a list of technical edits; name a component when it clarifies the outcome.
- **Context:** makes the problem and its consequence understandable without recent chat history. Lead with the central idea; use an invariant when it helps explain the change.
- **Scope:** makes the goals and meaningful non-goals explicit. Keep `Goals` and `Non-goals` named when the repository's review workflow relies on those labels.
- **Solution:** explains how the actual implementation achieves the goals, including the important mechanisms and resulting behavior. Give enough detail to understand the approach without reconstructing it from the diff.
- **Evidence:** states what verification actually ran, its results, and meaningful gaps. Keep code readiness, deployment, and live acceptance distinct when relevant.

## Writing judgment

Aim for the shortest description that preserves understanding. A small change may need only a few sentences; a complex change may need distinct areas, a concrete before/after example, or a compact diagram or table. Use these when they clarify the change, without fixed counts or a prescribed layout.

Use plain language and concrete details. File, function, field, and command names are useful when they explain a mechanism, but should not replace that explanation. Describe failure behavior and safety guarantees when they matter to this change.

Give reviewers facts they can judge independently. Avoid advocacy, expected review conclusions, instructions about what to review, and a recap of implementation debates. Keep open questions separate from established facts.

## Grounding

Base the description on the current diff, relevant commits, existing PR body, and available verification evidence. Verify related PR states and dependency claims against current sources. If evidence is unavailable, state the uncertainty rather than inventing a result.

Keep the title and main body aligned with the final scope and implementation as the work evolves. Preserve relevant authored content and user constraints when updating an existing description. Keep credentials and private or unrelated project details out of public drafts.

## When relevant

- **Related work:** explain how companion PRs fit together, dependency direction, and actual activation status. A merged PR is not necessarily enabled or accepted.
- **Initial designs:** make their provisional status clear near the top, for example, "Initial cut — nothing here is frozen." Distinguish explicit requirements from design choices that may evolve; omit this framing for settled or explicitly frozen work.
- **Companion specs:** create them only when requested. Follow existing path and format conventions, link them from the PR, and keep them aligned with current intent and acceptance criteria. Reuse a shared spec for stacked work rather than duplicating it.
- **Follow-up:** make remaining actions, genuine open questions, and dependencies or approvals visible. Distinguish proposed work from what this diff implements and verifies.
- **Changelog:** when durable history is needed, keep a brief newest-first `Changelog` at the bottom, with the body above stating current truth. Each entry records the actual date/time in the user's timezone, a real short commit SHA when known, a short bold subject, what changed, and a concise reason tied to scope. Preserve existing companion-document history formats and older entries; do not invent historical times, evidence, or commits.

## Publishing

Remote edits need user authorization; an existing instruction to update the PR counts. Otherwise, present the concrete draft before requesting approval. Honor draft-only requests.

When publishing, use a body file with real newlines (`gh pr edit --body-file`), then fetch the updated title and body to verify the result.
