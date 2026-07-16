---
name: mux-chatgpt-review
description: Loop a pull request through a user-selected ChatGPT browser surface in cmux, verify and fix actionable findings, push approved fixes, and rereview each new exact head until ChatGPT reports all clean. Use when the user asks for ChatGPT browser review, mux-chatgpt-review, a cmux ChatGPT PR review loop, or provides workspace, pane, and surface refs for iterative review.
---

# Mux ChatGPT Review

Run one neutral pull request review loop through the ChatGPT browser surface selected by the user. Preserve one chat while findings are being fixed, then require a clean result from a fresh chat on the unchanged head. Reuse `$mux-orchestrate` for scope, repair-family, guidance-refresh, and structural-reset rules.

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

## Start the working chat

Begin the first review in a fresh conversation under the same ChatGPT project or custom GPT shown by the selected surface. A person may use ChatGPT's `/new` menu and choose `New chat`, never `Branch chat` or `Retry response`. For cmux browser automation, use ChatGPT's `Shift+Command+O` new-chat shortcut; it is more deterministic than automating the transient `/new` menu and preserves the current GPT or project. Do not use the global sidebar action if it would leave the selected GPT or project.

Verify the conversation URL or identity changed and that no prior user or assistant messages remain before sending the review. Do not submit the literal `/new` text as a chat message.

## Submit a neutral review

Keep the prompt short so ChatGPT owns the investigation. Do not include suspected bugs, implementation history, preferred fixes, or a long checklist:

```text
REQUEST_ID=github:<owner>/<repository>:pr:<number>:head:<short-sha>:<YYYYMMDDTHHMMSS+offset>

Review @GitHub <owner>/<repository> PR #<number>.
```

Generate the request ID from the live GitHub head and current system time. It is a routing marker for the orchestrator, not an instruction that ChatGPT must echo.

Use the shared browser transport from `mux-orchestrate`:

```bash
SKILL=${CODEX_HOME:-$HOME/.codex}/skills/mux-orchestrate
"$SKILL/scripts/cmux-review-send.sh" browser surface:N /tmp/review-prompt.txt
"$SKILL/scripts/cmux-review-poll.sh" browser surface:N
```

Confirm submission by reading the newest user message and matching the request ID. A successful fill or click alone is not proof.

## Wait for the real result

ChatGPT reviews commonly take several minutes. Wait at least two minutes before the first result poll and at least two minutes between later polls while the review remains active. Do not send reminders, duplicate the prompt, or interpret intermediate research notes as findings.

Accept a result only when the newest completed assistant message was created after the current prompt and contains both:

- the exact full head SHA it reviewed, matching the current GitHub head
- actionable findings or an explicit clean verdict

The stop button, progress text, source cards, elapsed-time label, or disappearance of a generating indicator is not sufficient. An answer for an older head is stale even when it is the newest completed assistant message. If the final answer omits the reviewed head, ask only which full head SHA it reviewed before classifying the verdict.

## Fix and rereview

Classify every final finding against the live diff. Relay reviewer errors with evidence instead of changing code to satisfy them. For each real in-scope finding:

1. Reproduce or verify it locally.
2. Apply the structural root-cause correction under the open repair-family ledger.
3. Run the repository-required checks.
4. Commit and push only under the user's mutation authority. An explicit request to fix, push, and loop covers those in-scope review rounds; otherwise ask before the first remote mutation.
5. Refresh the PR title or description when the solution or scope changed.
6. Verify GitHub reports the new exact head.

Keep fixes and rereviews in the same working chat so ChatGPT retains its own findings. After every changed head, send only:

```text
REQUEST_ID=github:<owner>/<repository>:pr:<number>:head:<short-sha>:<YYYYMMDDTHHMMSS+offset>

Updated. Re-review everything.
```

Do not summarize the finding or fix and do not start a fresh chat while that working chat still reports findings. Wait using the same two-minute minimum interval.

## Independent clean confirmation

After the working chat reports clean, verify its reviewed head still matches GitHub and the required local checks pass. Then start one fresh chat under the same GPT using the procedure above and submit the minimal repository-and-PR prompt again.

Finish only after two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations. If the fresh confirmation finds anything, it becomes the new working chat: fix and rereview in that chat until clean, then start another fresh confirmation chat. Any changed head resets the consecutive-clean count.

At completion, require a clean working tree and report the final head, both clean chat verdicts, checks, commits, pushes, PR metadata changes, and any unresolved limitation. Do not post the browser review to GitHub unless the user separately asks.
