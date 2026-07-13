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
SKILL=${DEVX_MUX_SKILL_DIR:-${CODEX_HOME:-$HOME/.codex}/skills/devx-mux}
session="$($SKILL/scripts/session-jsonl-path.sh codex "$PWD" <session-id>)"
$SKILL/scripts/session-jsonl-read.sh --seed "$session" /tmp/devx-mux-review.cursor
# Send the review prompt after seeding.
$SKILL/scripts/session-jsonl-read.sh codex "$session" /tmp/devx-mux-review.cursor
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

## Browser exception

ChatGPT browser panes do not use the local Codex or Grok JSONL stores. Poll the latest assistant DOM response through the shared browser transport and verify the current `REQUEST_ID`.

## Mux fallback

If the provider cannot identify a usable session file, read through the active transport:

- cmux: use `cmux read-screen` for terminal reviewers and the browser DOM helper for ChatGPT.
- RexIDE: use the socket `tail` command for terminal reviewers and `browser-eval` or `browser-text` for ChatGPT.

Re-resolve the target before each fallback read. Treat pane and surface IDs as ephemeral, and read enough scrollback to include the complete report rather than only its verdict tail.
