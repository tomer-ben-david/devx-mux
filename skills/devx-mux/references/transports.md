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
