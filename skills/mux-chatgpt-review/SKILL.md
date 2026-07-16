---
name: mux-chatgpt-review
description: Loop a pull request through a user-selected ChatGPT browser surface in cmux, verify and fix actionable findings, push approved fixes, and rereview each new exact head until ChatGPT reports all clean. Use when the user asks for ChatGPT browser review, mux-chatgpt-review, a cmux ChatGPT PR review loop, or provides workspace, pane, and surface refs for iterative review.
---

# Mux ChatGPT Review

Run one neutral, exact-head pull request review loop through the ChatGPT browser surface selected by the user. Reuse `$mux-orchestrate` for scope, repair-family, guidance-refresh, and structural-reset rules.

## Resolve the run

Establish the PR number, repository, current PR head, mutation authority, and required local checks. Read live PR metadata with `gh`; do not infer the head or base from the current branch name.

Require one complete cmux identity block before browser interaction:

```text
workspace_ref=workspace:...
workspace_id=...
pane_ref=pane:...
pane_id=...
surface_ref=surface:...
surface_id=...
```

If any identity is missing and cannot be recovered from the supplied UUIDs, ask once for the complete block. Verify refs and UUIDs with `cmux --json --id-format both tree --all`. Re-resolve a stale ref from its UUID; never substitute the focused surface or a similarly named ChatGPT tab.

Verify that the selected surface belongs to the supplied pane and workspace and shows an `https://chatgpt.com/` URL. A hidden WebView may require selecting the explicitly authorized workspace and pane before browser automation. Do not switch to an unrelated workspace.

## Submit a neutral review

Keep the prompt short so ChatGPT owns the investigation. Do not include suspected bugs, implementation history, preferred fixes, or a long checklist:

```text
REQUEST_ID=<unique round id>

Review PR #<number> at exact head <full sha>. Independently read the live PR context and complete diff. Return actionable P1, P2, or P3 findings with file and line evidence and durable corrections, or say ALL CLEAN. Stay read-only. Include this request ID and the reviewed head in the final response.
```

Use the shared browser transport from `mux-orchestrate`:

```bash
SKILL=${CODEX_HOME:-$HOME/.codex}/skills/mux-orchestrate
"$SKILL/scripts/cmux-review-send.sh" browser surface:N /tmp/review-prompt.txt
"$SKILL/scripts/cmux-review-poll.sh" browser surface:N REQUEST_ID=<id>
```

Confirm submission by reading the newest user message and matching the request ID. A successful fill or click alone is not proof.

## Wait for the real result

ChatGPT reviews commonly take several minutes. Wait at least two minutes before the first result poll and at least two minutes between later polls while the review remains active. Do not send reminders, duplicate the prompt, or interpret intermediate research notes as findings.

Accept a result only when the newest completed assistant message contains all of:

- the current request ID
- the exact full head SHA
- actionable findings or an explicit `ALL CLEAN` verdict

The stop button, progress text, source cards, elapsed-time label, or disappearance of a generating indicator is not sufficient. An answer for an older request or head is stale even when it is the newest completed assistant message.

## Fix and rereview

Classify every final finding against the live diff. Relay reviewer errors with evidence instead of changing code to satisfy them. For each real in-scope finding:

1. Reproduce or verify it locally.
2. Apply the structural root-cause correction under the open repair-family ledger.
3. Run the repository-required checks.
4. Commit and push only under the user's mutation authority. An explicit request to fix, push, and loop covers those in-scope review rounds; otherwise ask before the first remote mutation.
5. Refresh the PR title or description when the solution or scope changed.
6. Verify GitHub reports the new exact head.

Ask for a rereview on every changed head with a fresh request ID and the same short neutral prompt. Do not describe the prior finding or the fix in the rereview prompt. Wait using the same two-minute minimum interval.

Finish only when ChatGPT reports `ALL CLEAN` for the current GitHub head, required local checks pass on that head, and the working tree is clean. Report the final head, reviewer verdict, checks, commits, pushes, PR metadata changes, and any unresolved limitation. Do not post the browser review to GitHub unless the user separately asks.
