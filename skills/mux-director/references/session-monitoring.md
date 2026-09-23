# Session monitoring

Prefer provider session artifacts for terminal-based Codex and Grok reviewers. They preserve the complete report and avoid losing findings above the visible scrollback.

## Match before reading

Never choose the newest session globally. Several agents may run concurrently.

Match the session using the strongest available evidence:

1. Session ID shown by the resolved reviewer target.
2. Provider active-session registry entry matching the repository cwd and process.
3. Session metadata matching provider, cwd, start time, and target activity.
4. Ask the idle reviewer target for the exact file that stores its current session.
5. Mux socket or pane scrollback when no session artifact can be identified safely.

If more than one session still qualifies, report the ambiguity instead of guessing.

Use the shared resolver when the provider and repository are known:

```bash
SKILL=${MUX_DIRECTOR_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills/mux-director}
session="$($SKILL/scripts/session-jsonl-path.sh codex "$PWD" <session-id>)"
$SKILL/scripts/session-jsonl-read.sh --seed "$session" /tmp/mux-review.cursor
# Send the review prompt after seeding.
$SKILL/scripts/session-jsonl-read.sh codex "$session" /tmp/mux-review.cursor
```

Omit `<session-id>` only when cwd identifies exactly one active or stored candidate. The resolver deliberately fails on ambiguity. For Grok, replace `codex` with `grok`; its resolver uses the active-session registry before locating `chat_history.jsonl`.

Seed the cursor immediately before sending the review prompt. Normal polls then parse only appended rows. If monitoring starts after the answer was produced, using a new unseeded cursor intentionally reads the existing transcript for recovery.

When asking the reviewer, keep it separate from review work:

```text
Quick transport question only: what exact local file stores this current session transcript? Return the path only. Do not start or continue a review.
```

Do not send that question while a review is running. For an active review, use the mux fallback for the current round and ask about the transcript path only after the target is idle.

## Codex

Codex sessions normally live under:

```text
${CODEX_HOME:-$HOME/.codex}/sessions/YYYY/MM/DD/*.jsonl
```

Confirm the session metadata and repository before reading. Track a byte or line cursor and read only appended records on later polls. Detect session rotation before each read and move the cursor only when the replacement session is proven to belong to the same reviewer target.

Extract actual assistant messages and final review output. Do not treat tool events, progress notes, or an interrupted turn as the verdict.

## Grok

Grok commonly exposes active sessions through:

```text
$HOME/.grok/active_sessions.json
```

Match the entry by cwd and process, then read that session's `chat_history.jsonl`. Verify the current schema before parsing because provider formats can evolve. In known formats, message identity may use `type` rather than `role`.

Read the complete assistant report, not only its last verdict line.

## Completion

A report is complete only when the provider emitted its final assistant response and the target returned to an idle/ready state. If the session stopped mid-turn or the mux target was interrupted, record the review as incomplete and rerun it.

### Bounded wait for a local session

For a local Codex or Grok target, prefer the `wait` subcommand over a fixed blind sleep. It resolves the session, reads only appended rows via the seeded cursor, and exits `0` (printing the final assistant message) as soon as a final message has appeared **and** the transcript stops growing for one interval - i.e. the target went idle. It exits non-zero with an honest `incomplete` message on timeout, so a missing result is never misread as completion.

```bash
SKILL=${MUX_DIRECTOR_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills/mux-director}
# seed the cursor at the current tail before handing work to the target, then wait:
$SKILL/scripts/session-jsonl.ts wait codex "$PWD" <session-id> \
  --cursor /tmp/mux-wait.cursor --max 600 --interval 15 && echo "target idle"
```

The quiescence check is a proxy for "assistant output + no recent transcript growth". A paused tool or background agent can remain active without writing rows, so exit 0 is a signal to inspect the result, not proof of task completion.

`--max` is the only timeout bound - do not wrap `wait` in `timeout(1)`, which macOS does not ship. `wait` self-terminates at `--max` (verified by test) and exits non-zero with `incomplete`, so it never hangs. Pass a `--cursor` file so repeated waits only observe new content.

## Browser exception

ChatGPT browser panes do not use the local Codex or Grok JSONL stores. After a long background wait, inspect the same browser surface directly and interpret its latest visible response. Do not delegate result selection or completion judgment to a parser or waiter script.

### Bounded wait for a ChatGPT browser target

Do not wake every interval to narrate "still waiting" - that burns tokens on reasoning turns that produce no action. Use the bounded browser idle waiter once, which sleeps a floor (browsers/ChatGPT need time before checking is worthwhile), then blocks on the ChatGPT **send control reappearing** - a transport idle signal (the UI is ready to type again = done generating), not response-content parsing. It exits `0` when idle or non-zero with an honest `still generating` message on timeout:

```bash
SKILL=${MUX_DIRECTOR_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills/mux-director}
$SKILL/scripts/browser-wait-idle.ts surface:N --floor 150 --max 600 && echo "ChatGPT idle"
```

Run it as a tracked FOREGROUND task, never fire-and-forget with a shell `&`. After it exits `0`, perform the single content read and your own completion judgment (the waiter does not classify the verdict). The invariant is unchanged: no script decides a ChatGPT review is complete - this only signals the UI returned to idle.

## Mux fallback

If the provider cannot identify a usable session file, read through the active transport:

- cmux: use `cmux read-screen` for terminal reviewers and the browser DOM helper for ChatGPT.
- Rex: use the socket `tail` command for terminal reviewers and the shared semantic browser HTML transport for ChatGPT.

Re-resolve the target before each fallback read. Treat pane and surface IDs as ephemeral, and read enough scrollback to include the complete report rather than only its verdict tail.


## Compact task status and scheduled checks

For a multi-task queue, an optional small status file per stable task ID can project the existing handoff: owner, running/blocked/done, updated time, result commit or artifact, test evidence, and blocker. Write atomically; retain the result rather than deleting the file. File disappearance, an idle prompt, and an agent's done flag are signals, not acceptance evidence.

Read these compact records before transcripts. On a relevant transition, verify only the necessary artifact, exact PR head or test result. If unchanged, avoid repeated full transcript and GitHub reads. A stale status record or independently observed completion warrants one targeted reconciliation; do not let a missing update hide a finished or stalled task indefinitely.

When the user requests later notification, use the host's supported scheduler. A periodic heartbeat is not a filesystem-event wakeup, and a foreground file waiter cannot promise to wake an ended conversation. Stay quiet on unchanged state; notify meaningful completion, failure or needed user action. Use an event watcher only when the host actually supports that delivery path; do not build a second orchestration service for status tracking.

The session waiter returns consumed assistant messages on timeout as well as success. A non-zero exit still means incomplete: keep the partial evidence and inspect the target before claiming completion. Transcript quiescence is only a transport heuristic, never proof that queued tasks or background agents finished.
