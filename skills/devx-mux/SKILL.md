---
name: devx-mux
description: Orchestrate an implementor and independent Codex, Grok, or ChatGPT reviewers across cmux, RexIDE, or another terminal multiplexer. Use when the user asks for mux-orchestrate, a multi-review loop, a Codex implementor plus reviewer panels, mux-aware panel discovery, codex-review or grok-review coordination, or the older codex-orchestrate, cmux-review-loop, rex-review-loop, or staged-pr-review workflows.
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

For RexIDE, accept the equivalent task/pane/tab block.

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

The scripts in `scripts/` provide one public, shared ChatGPT browser transport for cmux and RexIDE:

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
Transport: cmux | rexide
Implementor: <target>
Reviewers: <targets>
Scope: <exact comparison>
Head: <sha>
State: implementing | reviewing | fixing | clean | blocked
Unresolved: <findings or none>
Next: <one action>
```

At completion, report the final head, checks run, each reviewer's verdict, unresolved limitations, and every remote action taken.
