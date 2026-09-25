# Transport adapters

Use one transport for a run. Discover targets from live state before sending.

## cmux

Use the cmux CLI or the installed cmux skills. Start with `cmux identify` and `cmux tree`. Restrict automatic target discovery to the caller's workspace.

```bash
cmux identify --json
cmux tree --workspace workspace:N
cmux read-screen --surface surface:N --lines 120
cmux send --surface surface:N "<prompt>"
cmux send-key --surface surface:N enter
```

Resolve exact tab titles for terminal roles. A terminal titled `codex-review` is not interchangeable with `codex`. For browser review, resolve ChatGPT by URL within the caller's workspace because page titles drift.

After every terminal send, submit with Enter and verify that the target started working. A successful `cmux send` only proves text delivery.

## DevX Rex

Resolve the socket, then inspect the active task and its panes:

```bash
SOCK="$HOME/Library/Application Support/rex/rex.sock"
printf 'tree\n' | nc -U "$SOCK"
printf 'tail pane:<id> 4000\n' | nc -U "$SOCK"
printf 'submit pane:<id> <prompt>\n' | nc -U "$SOCK"
```

Prefer targets inside the active/origin task. Use a pane name only after confirming its role and repository. A returned `ok` must confirm submission before polling.

The resolver accepts `REX_SOCKET_PATH` as an explicit override. During the rename transition, it uses the legacy `rexide/rexide.sock` path only when the canonical Rex socket is absent.

## Codex Desktop Root notification

Read the Root thread UUID, title, and project directory from Codex Desktop or the Root's handoff; never guess them. An agent lane (for example Claude or Grok Bot) that is genuinely blocked can notify its manager ("Root") in an existing Codex Desktop (ChatGPT app) conversation without the user relaying. Use it only for a blocker that needs Root's decision; never for progress, polling, or status.

```bash
N="$SKILL/scripts/codex-desktop-notify.ts"
ROOT=(--thread <root-thread-uuid>
      --expect-name "<exact Root task title>"
      --expect-cwd <Root project directory>)

node "$N" check "${ROOT[@]}"          # read-only preflight; sends nothing
node "$N" blocker "${ROOT[@]}" --from "Claude lane-a" \
  --blocker "Integration fixture is missing" \
  --evidence "tests/example.test.ts:41 ENOENT fixtures/example.json" \
  --decision "Regenerate the fixture, or drop that case from the suite?"
```

Other lanes use the same command with their own `--from` label, for example `--from "Grok Bot"`. Each message is labelled as an AI-agent notification with its sender and a unique `ref`. It is never user authorization; Root judges it like any other agent input.

Transport: the first-party `codex queue --thread <uuid> --message` command from the running Desktop's own bundle. It only calls app-server `thread/queue/add` on the shared durable queue. The Desktop's app-server picks up externally queued items within about 10 seconds and starts one when Root is idle, or after Root's running turn completes. It never steers into or stops a running turn, and it does not touch the composer draft, the clipboard, or session files. Nothing resumes the thread in a second server.

Before sending, the script requires the exact thread UUID, the expected Desktop title (unique among active threads), the expected project directory, a rollout transcript belonging to that thread, and a running Desktop app-server. It refuses without sending when Root's last turn was interrupted (Codex does not drain the queue until the user continues) or when an earlier agent notification is still queued.

Delivery is reported only from Root's rollout transcript: a user message containing the `ref` plus the `task_started` event of the turn it started. Exit codes: `0` delivered, `3` refused before sending, `4` queued behind Root's active turn, `5` uncertain. The script sends once and never retries. After `4` or `5`, do not resend; check later with `verify "${ROOT[@]}" --ref <ref> --since-byte <sinceByte>` from the printed report.

## Unknown mux

Treat a new mux as an adapter with four operations:

```text
tree()                 list workspaces and targets
inspect(target)        verify role/repo/branch/state
submit(target, text)   deliver and confirm input
poll(target)           read current output
```

Do not add provider-specific branches to the orchestration protocol. Add only the transport adapter, then reuse the same role and review state machine.

## Resolution failure

Never guess from focus or choose a similarly named target in another workspace. Print the candidates found, state which role is unresolved, and request one complete identity block. Preserve any IDs already supplied so the user is not asked twice.
