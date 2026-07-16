---
name: devx-mux
description: Orchestrate an implementor and independent Codex, Grok, or ChatGPT reviewers across cmux, DevX Rex, or another terminal multiplexer. Use when the user asks for mux-orchestrate, a multi-review loop with an implementor, mux-aware panel discovery, repeated-patch or context-drift detection, codex-review or grok-review coordination, or the older codex-orchestrate, cmux-review-loop, rex-review-loop, or staged-pr-review workflows. Use mux-multireview instead for read-only concurrent Codex and Grok review without implementation.
---

# DevX Mux

Coordinate implementation and review while keeping the user in control. Treat the mux as a transport boundary, not as the owner of the workflow.

## Model

```text
user
  -> orchestrator
     -> implementor       codex / codex-implementor
     -> reviewers         codex-review + grok-review
     -> optional browser  ChatGPT
```

The orchestrator reasons with the user, routes work, verifies state, and relays findings. The implementor edits and validates. Reviewers independently inspect the selected scope. Never let a reviewer inherit the implementation discussion.

## Start

1. Detect the transport and current workspace/task.
2. Discover the implementor and reviewer targets from the live mux tree.
3. Verify each target's role, repository, branch, and readiness from its visible state.
4. State the resolved map before sending work.

Read [references/transports.md](references/transports.md) for transport commands and target-resolution rules.
Read [references/session-monitoring.md](references/session-monitoring.md) when following Codex or Grok terminal reviewers.

Prefer these canonical names:

| Role | Preferred target names |
| --- | --- |
| Implementor | `codex`, `codex-implementor` |
| Codex reviewer | `codex-review`, `codex-reviewer` |
| Grok reviewer | `grok-review`, `grok-reviewer` |
| Standards reviewer | `codex devx-coding-standards` |
| Browser reviewer | `chatgpt` |

Accept explicit pane/surface refs. Treat numeric IDs as ephemeral and re-resolve them from the live tree before a later round.

If discovery fails, fail loud and ask once for the full mux identity block. Do not ask for one ID at a time and do not silently choose the focused pane:

```text
workspace_ref=workspace:...
workspace_id=...
pane_ref=pane:...
pane_id=...
surface_ref=surface:...
surface_id=...
```

For Rex, accept the equivalent task/pane/tab block.

## Scope contract

Before implementation or review, establish:

- Goal: one sentence describing the intended outcome.
- Non-goals: the real boundaries.
- Review scope: local, commit, branch from its Git-derived merge base, PR, or codebase.
- Mutation authority: whether the implementor may edit, commit, push, update a PR, or resolve threads.

Never assume `main` or `origin/main`. Ask Git for the base unless the user explicitly supplies one. Treat the PR body as context that can be stale, not as proof of the current diff.

Use `$pr-title-description` when the PR title/body is missing, stale, or unclear. Keep `Goals` and `Non-goals` named exactly so reviewers share one scope lens.

## Implementation loop

1. Prove the user-visible problem or desired outcome before implementation when possible.
2. Give the implementor the goal, constraints, relevant area, and required verification. Leave the approach open.
3. Prefer a structural root-cause fix over a second source of truth or layered guard.
4. Read the full implementor result and verify material claims against repository state or runtime evidence.
5. Ask before any push, PR edit, bot trigger, thread resolution, deploy, or other remote mutation.

Do not edit code locally when the user asked the orchestrator to manage a separate implementor. If the user asks this agent to implement directly, normal repository instructions apply.

## Structural reset

Track fix rounds for the current goal. A fix round is an implementor edit-and-verification response after a failed reproduction, rejected approach, or accepted finding. Do not reset the count because the symptom moved to an adjacent layer or a narrow test passed. Reset it only when the user-visible outcome is proven or the user changes the goal.

Pause implementation and run a structural reset when any of these occurs:

- a third fix round starts for the same goal
- two consecutive rounds add guards, fallbacks, retries, flags, mirrored state, or special cases around the same flow without removing the underlying ownership flaw
- the same symptom or finding class returns after a claimed fix
- each fix expands into another adjacent layer without a stable root-cause explanation
- the orchestrator or implementor contradicts, omits, or cannot restate the goal, non-goals, mutation authority, relevant guidance, or required evidence

Do not wait for the round threshold when context drift or patch layering is already clear. When the reset triggers:

1. Tell the user that implementation is paused for a structural reset.
2. Reread this entire skill, repository instruction files, the current scope contract, relevant coding standards, the full current diff, and the evidence from every fix round.
3. Identify the framework, library, platform, and version from repository files. When one owns the behavior under repair, research its current official documentation, specifications, RFCs, or other primary sources. Prefer version-matched sources over generic articles or popular opinion. If online research is unavailable, state the limitation rather than inventing guidance.
4. Write a compact reset brief with the observed patch loop, proven facts, unknowns, state or component that should own the invariant, structural direction, patches that direction replaces, and user-visible verification needed.
5. Ask the implementor to reassess from that brief and propose the root-cause solution before editing again. Keep the approach open enough for the implementor to improve it.

## Guidance refresh

Record when the orchestration guidance was last read. During active orchestration, check elapsed time at every control boundary: implementor or reviewer update, poll, fix round, scope change, transport re-resolution, and completion check.

When 15 minutes have elapsed, reread this entire skill, the repository instruction files, the scope contract, and every reference currently active for the workflow before taking the next action. This is a backstop, not a sleep-based timer: the orchestrator cannot wake itself while idle, so refresh at the next control boundary. Refresh immediately, regardless of elapsed time, after context compaction or session reset, or whenever actions reveal forgotten or contradictory guidance.

Before declaring completion, confirm that the current diff, verification, remote actions, and unresolved limitations still match the refreshed guidance and scope contract.

## Multi-review loop

Read [references/review-protocol.md](references/review-protocol.md) before starting a review round.

For every round:

1. Record the exact head and selected scope.
2. Start each interactive reviewer fresh with `/new` and verify reset succeeded.
3. Invoke the reviewer's native review mechanism against the same scope.
4. Poll each reviewer independently and read its full report.
5. Relay every finding with its source and an orchestrator classification. Never silently filter a finding.
6. Send accepted findings to the implementor without prescribing the patch.
7. Validate fixes, then rerun every participating reviewer on the new head.
8. Declare convergence only when all participating reviewers are clean on the same head.

Use `mux multireview` when the user wants provider-neutral concurrent Codex and Grok review without managing persistent panes. Do not silently replace named mux panels with `mux multireview`; tell the user which execution model is active.

For persistent Codex and Grok panels, prefer their JSONL session files over terminal scrollback once the session is matched to the exact target and repository. Use pane reads only for discovery, readiness, and fallback.

## Browser review

The scripts in `scripts/` provide one public, shared ChatGPT browser transport for cmux and Rex:

```bash
SKILL=${CODEX_HOME:-$HOME/.codex}/skills/devx-mux

"$SKILL/scripts/cmux-review-send.sh" browser chatgpt /tmp/review-prompt.txt
"$SKILL/scripts/cmux-review-poll.sh" browser chatgpt REQUEST_ID=<id>

"$SKILL/scripts/rex-review-send.sh" chatgpt /tmp/review-prompt.txt
"$SKILL/scripts/rex-review-poll.sh" chatgpt REQUEST_ID=<id>
```

Send one prompt per request, require confirmed submission, and poll until the current request's answer is visible. Do not treat stale browser text as a new answer.

## Reporting

Keep the live report small:

```text
Transport: cmux | rex
Implementor: <target>
Reviewers: <targets>
Scope: <exact comparison>
Head: <sha>
State: implementing | reviewing | fixing | clean | blocked
Fix rounds: <count for current goal>
Guidance refreshed: <time or control boundary>
Unresolved: <findings or none>
Next: <one action>
```

At completion, report the final head, checks run, each reviewer's verdict, unresolved limitations, and every remote action taken.
