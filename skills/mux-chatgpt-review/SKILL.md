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

Inspect the selected conversation before changing it. If it already contains an active or completed review that the user wants to continue, preserve the conversation and adopt its latest user turn with the read-only adoption command:

```bash
TURN_TOKEN=$(node "$SKILL/scripts/chatgpt-review-adopt.mjs" cmux surface:N)
READY=$(node "$SKILL/scripts/chatgpt-review-wait.mjs" cmux surface:N "$TURN_TOKEN")
node "$SKILL/scripts/chatgpt-review-poll.mjs" cmux surface:N "${READY#READY }"
```

The adoption token binds the waiter to both the exact user-message identity and normalized conversation URL. Adoption never navigates, submits, branches, replaces, or resets the conversation. Never use `/new` as recovery for a running, completed, unmarked, or temporarily unreadable review. Recover the same UUID-backed surface and conversation. If a share link is needed for diagnosis, open it in a different surface.

Only when the selected conversation contains no review to preserve, begin the first Mux-submitted review in a fresh conversation under the same ChatGPT project or custom GPT. A person may use ChatGPT's `/new` menu and choose `New chat`, never `Branch chat` or `Retry response`. For cmux browser automation, use ChatGPT's `Shift+Command+O` new-chat shortcut. Do not use the global sidebar action if it would leave the selected GPT or project.

Verify the conversation URL or identity changed and that no prior user or assistant messages remain before sending the review. Do not submit the literal `/new` text as a chat message.

## Submit a neutral review

Keep the prompt short so ChatGPT owns the investigation. Do not include suspected bugs, implementation history, preferred fixes, or a long checklist:

```text
REQUEST_ID=github:<owner>/<repository>:pr:<number>:head:<full-sha>:<YYYYMMDDTHHMMSS+offset>

Review @GitHub <owner>/<repository> PR #<number>.
```

Immediately before submission, read and retain the immutable full PR head from GitHub. Generate the request ID from that submission head and current system time. It is both the prompt-to-response boundary and a routing marker for the orchestrator, not an instruction that ChatGPT must echo.

Use the shared browser transport from `mux-orchestrate`:

```bash
"$SKILL/scripts/cmux-review-send.sh" browser surface:N /tmp/review-prompt.txt
READY=$(node "$SKILL/scripts/chatgpt-review-wait.mjs" cmux surface:N REQUEST_ID=<id>)
node "$SKILL/scripts/chatgpt-review-poll.mjs" cmux surface:N "${READY#READY }"
```

Confirm submission by reading the newest user message and matching the request ID. A successful fill or click alone is not proof.

## Wait for the real result

Run `chatgpt-review-wait.mjs` once in a background terminal and wait on that same process until it exits. At startup it resolves the submitted request into the same immutable conversation-URL and user-message boundary used by adoption; every later poll uses only that bound turn identity. The runtime is built from checked TypeScript, bundles its parser dependencies, and works through installed skill symlinks. The waiter owns readiness only: it polls internally once per minute, requires the completed UI control inside the exact response turn, then requires the same response signature on three consecutive polls before returning `READY <turn-token>`. It never returns the review body. After it exits, the agent performs one exact-turn read with `chatgpt-review-poll.mjs` and interprets that result itself. The waiter retries transient browser-read timeouts and frame replacement, but fails loudly for a lost surface, changed conversation, wrong tab, socket failure, or malformed state. It emits the last semantic wait state at most once every five minutes and has no elapsed-time timeout. The agent must not add its own sleep loop, browser polling, page JavaScript, or body-text scraping around it. Do not send reminders, duplicate the prompt, or interpret intermediate research notes as findings.

Elapsed time alone never makes a ChatGPT review stalled or incomplete. There is no elapsed-time timeout or unchanged-progress limit. Do not click `Stop answering`, restart the review, or open a fresh chat because progress is unchanged or the review has taken many minutes. Keep waiting on the shared waiter process as long as it remains active. The 15-minute guidance refresh reloads the skill around the active run; it must not restart, replace, or otherwise disturb that run.

A run becomes incomplete only when ChatGPT reports an explicit failure or cancellation, the selected surface or conversation is lost and cannot be recovered, or the user cancels it. If a completed answer is visually present but browser text extraction fails, recover or reload the same conversation and preserve its context instead of starting over. A missing or temporarily inaccessible surface requires recovery attempts against the same UUID-backed surface and conversation before the run may be classified as lost.

The transport must report `waiting` until the bound user turn is visible, its following assistant turn exists, that response exposes its local completed UI control, ChatGPT is no longer generating, and the response contains non-empty text. It must not use a raw assistant-node count because ChatGPT can virtualize or re-render conversation nodes. After the waiter reports readiness and the agent reads the completed review, this focused workflow must accept it only when it contains both:

- the exact full head SHA it reviewed, matching both the retained submission head and a fresh GitHub head read
- actionable findings or an explicit clean verdict

Generation detection recognizes both ChatGPT's stop-button test ID and its visible or accessible `Stop answering` label. The stop button, progress text, source cards, elapsed-time label, or disappearance of only one generating indicator is not sufficient. If GitHub moved after submission, discard the result as stale even if ChatGPT reviewed the retained submission head correctly. An answer for an older head is stale even when it is the newest completed assistant message. If the final answer omits the reviewed head, ask only which full head SHA it reviewed before classifying the verdict.

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
REQUEST_ID=github:<owner>/<repository>:pr:<number>:head:<full-sha>:<YYYYMMDDTHHMMSS+offset>

Updated. Re-review everything.
```

Do not summarize the finding or fix and do not start a fresh chat while that working chat still reports findings. Start the same shared waiter once for the new request and wait on its process.

## Independent clean confirmation

After the working chat reports clean, verify its reviewed head still matches GitHub and the required local checks pass. Then start one fresh chat under the same GPT using the procedure above and submit the minimal repository-and-PR prompt again.

Finish only after two consecutive clean verdicts for the same unchanged GitHub head from two different chat conversations. If the fresh confirmation finds anything, it becomes the new working chat: fix and rereview in that chat until clean, then start another fresh confirmation chat. Any changed head resets the consecutive-clean count.

At completion, require a clean working tree and report the final head, both clean chat verdicts, checks, commits, pushes, PR metadata changes, and any unresolved limitation. Do not post the browser review to GitHub unless the user separately asks.
