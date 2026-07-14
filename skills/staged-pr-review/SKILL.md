---
name: staged-pr-review
description: Run a strict four-stage pull request review pipeline across the latest commit, full branch functional diff, DevX standards and readability, and a final deep full-PR review. Use for staged review, multi-stage PR review, review gates, or requests to advance only after each reviewer is clean.
---

# Staged PR Review

Run one stage at a time. Do not advance until the current stage has no unresolved actionable findings at the current head.

Read [references/orchestrator-gates.md](references/orchestrator-gates.md) and [`../devx-mux/references/review-protocol.md`](../devx-mux/references/review-protocol.md) before starting. Use the public `$devx-mux` skill for cmux and Rex transport behavior.

## Stages

| Stage | Scope | Lens |
| --- | --- | --- |
| 1 | Latest commit | Functional correctness and structural fit |
| 2 | Full branch from its merge base | Functional correctness across the complete change |
| 3 | Full branch from its merge base | DevX standards, clarity, and readability |
| 4 | Full PR at the current head | Deep production-risk review and final merge confidence |

Never assume the base is `main`. Use the PR base or Git-derived merge base and pass its human-readable name through `STAGED_BASE`.

## Prerequisites

1. Confirm the exact PR URL, compare URL, branch, base, and head.
2. Confirm the feature branch is pushed. Ask before pushing or changing the PR.
3. Resolve a ChatGPT browser target through `$devx-mux`.
4. Keep one `REQUEST_ID` per send and verify the response belongs to it.

## Run

```bash
SKILL=${CODEX_HOME:-$HOME/.codex}/skills/staged-pr-review

export STAGED_PR_URL="https://github.com/owner/repo/pull/123"
export STAGED_COMPARE_URL="https://github.com/owner/repo/compare/base...branch"
export STAGED_REPO="/path/to/repo"
export STAGED_BASE="base-branch"

"$SKILL/scripts/staged-review-send.sh" 1
"$SKILL/scripts/staged-review-poll.sh" REQUEST_ID=staged-s1-...
```

After stage 1 is clean, repeat with stages 2, 3, and 4. Targets may be `chatgpt`, `chatgpt-rex`, `browser`, `surface:N`, or `rex`.

Set `STAGED_REVIEW_DRY_RUN=1` to render and print a stage prompt without sending it.

## Triage

| Finding | Action |
| --- | --- |
| Real and in scope | Fix, validate, push with approval, then rerun the same stage |
| Disputed | Send concrete evidence and request withdrawal or a narrower finding |
| Pre-existing | Report separately; do not block the PR |
| Wrong stage | Defer to the matching stage; do not silently discard it |
| Product or policy decision | Ask the user |

Use the same neutral stage template after fixes. Do not list old findings or tell the reviewer what was fixed in a fresh review prompt.

## Clean gate

A stage is clean only when:

- the reviewer returned a real verdict for the current request and head;
- no actionable in-scope findings remain;
- stage 3 includes the complete standards checklist;
- merge confidence is not `no`, unless the user explicitly accepts the risk.

If a review was interrupted, treat it as incomplete and rerun it.

## Report

```text
Stage: N
Scope: <exact comparison>
Head: <sha>
REQUEST_ID: <id>
State: reviewing | fixing | clean | blocked
Findings: <summary or none>
Next: rerun stage N | advance to stage N+1 | complete
```
