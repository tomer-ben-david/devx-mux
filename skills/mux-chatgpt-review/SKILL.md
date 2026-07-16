---
name: mux-chatgpt-review
description: Loop a pull request through a user-selected ChatGPT browser surface in cmux, verify and fix actionable findings, push approved fixes, and rereview each new exact head until ChatGPT reports all clean. Use when the user asks for ChatGPT browser review, mux-chatgpt-review, a cmux ChatGPT PR review loop, or provides workspace, pane, and surface refs for iterative review.
---

# Mux ChatGPT Review

Run one neutral pull request review loop through the ChatGPT browser surface selected by the user. Preserve one chat while findings are being fixed, then require a clean result from a fresh chat on the unchanged head. Reuse `$mux-orchestrate` for scope, repair-family, guidance-refresh, and structural-reset rules.

Resolve the shared implementation once before any command example:

```bash
SKILL=${CODEX_HOME:-$HOME/.codex}/skills/mux-orchestrate
```

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

Inspect the selected conversation before changing it. Classify its review provenance before reading or sending: `Mux-submitted` when this workflow retained the head immediately before submission, or `adopted` when the review was already active or completed. If it already contains an active or completed review that the user wants to continue, preserve it, record the retained submission head as unavailable, and read that conversation directly. Never use `/new`, navigation, reload, branching, or retry as recovery for a running, completed, unmarked, or temporarily unreadable review. Recover the same UUID-backed surface and conversation. If a share link is needed for diagnosis, open it in a different surface.

Only when starting the first review or the required independent clean confirmation, begin a fresh conversation under the same ChatGPT project or custom GPT. Use ChatGPT's visible `New chat` control through a fresh cmux accessibility snapshot. Never encode a keyboard shortcut for this action: cmux owns some application shortcuts, and ChatGPT's web UI is not a stable shortcut API. Do not navigate to a guessed base URL or use the global sidebar if either action may leave the selected GPT or reopen the previous conversation.

If the visible `New chat` control cannot be resolved safely, ask the user once to create the fresh chat on the same surface. Verify that the conversation identity changed and no prior messages remain before sending. Do not submit the literal `/new` text as a chat message.

## Submit a neutral review

Keep the prompt short so ChatGPT owns the investigation. Do not include suspected bugs, implementation history, preferred fixes, or a long checklist:

```text
Review @GitHub <owner>/<repository> PR #<number>.
```

Immediately before submission, read and retain the immutable full PR head from GitHub. Record a local review label such as `github:<owner>/<repository>:pr:<number>:head:<full-sha>:<YYYYMMDDTHHMMSS+offset>` in the live report, but do not include transport metadata in the reviewer-visible prompt or browser state.

Use the shared browser transport from `mux-orchestrate`:

```bash
"$SKILL/scripts/cmux-review-send.sh" browser surface:N /tmp/review-prompt.txt
```

Confirm submission by inspecting the newest visible user message and matching the exact reviewer-visible prompt. A successful fill or click alone is not proof.

## Wait for the real result

After confirmed submission, use the agent runtime's background wait for about five minutes without reading or interacting with the browser. When that wait finishes, inspect the same UUID-backed surface directly through cmux or Rex visible browser commands. If ChatGPT still shows `Stop answering`, research/progress UI, an incomplete response, or no final verdict, run another five-minute background wait and inspect again. Keep this dynamic wait-and-inspect cycle indefinitely; do not impose a total elapsed-time timeout.

There is intentionally no Mux waiter, request token, turn token, response digest, or ChatGPT DOM parser. A sleep only delays the next inspection. It does not claim readiness, completion, or success. The agent owns the one browser read after each wait and interprets the current visible state. Do not poll every minute, scrape in a shell loop, run page JavaScript, or ask a script to decide which response is final.

Elapsed time alone never makes a ChatGPT review stalled or incomplete. Do not click `Stop answering`, restart the review, or open a fresh chat because progress is unchanged or the review has taken many minutes. The 15-minute guidance refresh reloads instructions around the active run; it must not restart, replace, or otherwise disturb that run.

A run becomes incomplete only when ChatGPT reports an explicit failure or cancellation, the selected surface or conversation is lost and cannot be recovered, or the user cancels it. If a completed answer is visually present but browser text extraction fails, recover the same UUID-backed surface and conversation through non-mutating inspection methods. If those methods cannot recover it, report the blocker and do not classify the run as complete. A missing or temporarily inaccessible surface requires recovery attempts against the same UUID-backed surface and conversation before the run may be classified as lost.

After the agent reads a completed review, apply one acceptance rule based on the recorded provenance:

| Provenance | Retained submission head | Exact-head acceptance |
| --- | --- | --- |
| `Mux-submitted` | Required | The response's full reviewed SHA matches both the retained submission head and a fresh GitHub head read. |
| `adopted` | Unavailable | The response's full reviewed SHA matches a fresh GitHub head read. The result may drive fixes or count as the working-chat verdict, but it never replaces the independent fresh-chat confirmation. |

Both paths also require actionable findings or an explicit clean verdict. Never manufacture a retained head after seeing an adopted review's result.

The disappearance of one progress indicator is not proof of completion; inspect the whole visible latest response. If GitHub moved after submission, discard the result as stale even if ChatGPT reviewed the retained submission head correctly. An answer for an older head is stale even when it is the newest completed assistant message. If the final answer omits the reviewed head, ask only which full head SHA it reviewed before classifying the verdict.

## Fix and rereview

Classify every final finding against the live diff. Relay reviewer errors with evidence instead of changing code to satisfy them. For each real in-scope finding:

1. Reproduce or verify it locally.
2. Apply the structural root-cause correction under the open repair-family ledger.
3. Run the repository-required checks.
4. Commit and push only under the user's mutation authority. An explicit request to fix, push, and loop covers those in-scope review rounds; otherwise ask before the first remote mutation.
5. Refresh the PR title or description when the solution or scope changed.
6. Verify GitHub reports the new exact head.

Do not converge through whack-a-mole patches that add another guard, exception, retry, or mirrored state for each symptom. When findings expose one invariant or ownership flaw, allow the repair to cross the adjacent layers needed to establish one durable owner and remove superseded patches. Treat that as an in-scope long-term structural improvement when it directly proves the goal and acceptance evidence. Do not use structural quality as permission for unrelated cleanup, speculative redesign, or opportunistic feature work; those remain scope creep and belong in separate work.

Keep fixes and rereviews in the same working chat so ChatGPT retains its own findings. After every changed head, send only:

```text
Updated. Re-review everything.
```

Record a new local review label for that submission, but keep it out of the prompt. Do not summarize the finding or fix and do not start a fresh chat while that working chat still reports findings. Resume the same five-minute wait-and-inspect cycle after the confirmed send.

## Independent clean confirmation

After the working chat reports clean, verify its reviewed head still matches GitHub and the required local checks pass. Then start one fresh chat under the same GPT using the procedure above and submit the minimal repository-and-PR prompt again.

Finish only after two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations. If the fresh confirmation finds anything, it becomes the new working chat: fix and rereview in that chat until clean, then start another fresh confirmation chat. Any changed head resets the consecutive-clean count.

At completion, require a clean working tree and report the final head, both clean chat verdicts, checks, commits, pushes, PR metadata changes, and any unresolved limitation. Do not post the browser review to GitHub unless the user separately asks.
