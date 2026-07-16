#!/usr/bin/env bash
# review-common.sh - single source of the ChatGPT review-loop orchestration.
#
# DevX Mux supports both Rex and cmux. Both drive a ChatGPT browser pane through the
# same five-step flow:
#
#   resolve socket -> find ChatGPT pane -> verify it is ChatGPT
#                  -> submit prompt / read body
#
# Only the *transport* differs (cmux CLI vs Rex's nc -U text protocol). Every
# transport appears exactly once here, branched on the `tool` argument (cmux|rex).
# Polling is implemented by checked TypeScript over semantic cmux or Rex socket
# reads; this shell library owns target resolution and prompt submission only.
#
# This file is a library: source it, do not execute it. It defines functions and
# resolves its own directory; it performs no work at source time beyond that.
#
# Functions:
#   review_socket_path <tool>                 print socket path; exit 1 if absent
#   review_find_chatgpt_pane <tool> <target>  print surface:N (cmux) / pane:<id> (rex)
#   review_get_url <tool> <handle>            print normalized https://... url; return 1
#                                             on a missing cmux binary, a read error,
#                                             or an empty response (never prints empty)
#   review_is_chatgpt <tool> <handle>         0 if handle is a ChatGPT tab, else 1
#   review_submit <tool> <handle> <prompt>    submit prompt; exit 1 if not confirmed
#   review_read_body <tool> <handle>          print visible body text for diagnostics
#   review_send_prompt_file <tool> <target> <file>

# Directory of this file. Both transport socket resolvers live next to it.
# BASH_SOURCE[0] is set under bash (the shebang runtime); fall back to $0 so a
# manual `source` from another shell still resolves correctly.
_REVIEW_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# Keep the cmux resolver beside this shared library. Tests or compatibility
# wrappers may override the directory explicitly.
_REVIEW_CMUX_SKILL_DIR="${CMUX_REVIEW_SKILL_DIR:-$_REVIEW_COMMON_DIR}"
# The cmux CLI is not always on PATH - spawned agent shells inherit a minimal
# PATH that omits the cmux.app bundle's bin dir. _review_resolve_cmux_bin finds
# the binary (PATH first, then the .app fallback), exports it as REVIEW_CMUX_BIN,
# and prepends the fallback dir to PATH so bare `cmux ...` calls work. cmux
# callers must invoke this first and fail loud if it returns 1, so a missing
# binary surfaces as an explicit error rather than an empty URL (see review_get_url).
_REVIEW_CMUX_FALLBACK_DIR="/Applications/cmux.app/Contents/Resources/bin"
_REVIEW_CMUX_FALLBACK_BIN="$_REVIEW_CMUX_FALLBACK_DIR/cmux"
_REVIEW_CMUX_BIN=""

_review_resolve_cmux_bin() {
    local resolved
    if [[ -n "$_REVIEW_CMUX_BIN" && -x "$_REVIEW_CMUX_BIN" ]]; then
        return 0
    fi
    if resolved="$(command -v cmux 2>/dev/null)" && [[ -n "$resolved" && -x "$resolved" ]]; then
        _REVIEW_CMUX_BIN="$resolved"
        export REVIEW_CMUX_BIN="$_REVIEW_CMUX_BIN"
        return 0
    fi
    if [[ -x "$_REVIEW_CMUX_FALLBACK_BIN" ]]; then
        _REVIEW_CMUX_BIN="$_REVIEW_CMUX_FALLBACK_BIN"
        export REVIEW_CMUX_BIN="$_REVIEW_CMUX_BIN"
        case ":$PATH:" in
            *":$_REVIEW_CMUX_FALLBACK_DIR:"*) ;;
            *) export PATH="$_REVIEW_CMUX_FALLBACK_DIR:$PATH" ;;
        esac
        return 0
    fi
    return 1
}

_review_cmux_not_found_message() {
    local caller="$1"
    echo "${caller}: cmux binary not found on PATH or at $_REVIEW_CMUX_FALLBACK_BIN; install cmux or add it to PATH" >&2
}

# -----------------------------------------------------------------------------
# Socket resolution - delegate to the existing single-purpose resolvers, which
# are also used directly by *-info.sh and ocr-review.sh (kept as the one source
# for each tool's socket path).
# -----------------------------------------------------------------------------
review_socket_path() {
    local tool="$1"
    case "$tool" in
        cmux)
            if [[ ! -x "$_REVIEW_CMUX_SKILL_DIR/cmux-review-socket-path.sh" ]]; then
                echo "review_socket_path: cmux skill not found at $_REVIEW_CMUX_SKILL_DIR" >&2
                echo "  set CMUX_REVIEW_SKILL_DIR to the mux-orchestrate scripts dir." >&2
                exit 1
            fi
            "$_REVIEW_CMUX_SKILL_DIR/cmux-review-socket-path.sh"
            ;;
        rex)
            "$_REVIEW_COMMON_DIR/rex-review-socket-path.sh"
            ;;
        *)
            echo "review_socket_path: unknown tool '$tool' (use cmux|rex)" >&2
            exit 2
            ;;
    esac
}

# Export CMUX_SOCKET_PATH so subsequent `cmux` CLI calls hit the resolved socket.
# No-op for rex (its transport takes the socket path explicitly).
_review_setup_socket() {
    local tool="$1"
    case "$tool" in
        cmux)
            if ! _review_resolve_cmux_bin; then
                _review_cmux_not_found_message "_review_setup_socket"
                exit 1
            fi
            export CMUX_SOCKET_PATH="$(review_socket_path cmux)"
            ;;
        rex)  : ;;
    esac
}

# -----------------------------------------------------------------------------
# Find the ChatGPT browser pane/surface for a target.
#   cmux target: surface:N | chatgpt | browser | <any name>
#   rex  target: pane:<id> | chatgpt | browser | pane name
#
# ChatGPT review tabs are addressed by WHAT they show (a https://chatgpt.com page),
# never by tab title - the title varies ("ChatGPT", "ChatGPT - Rex", a page title,
# a custom name the user typed). So a non-surface target resolves to the closest
# qualifying browser surface by URL, not by exact title. Pass surface:N to pin an
# exact surface when several ChatGPT panes are open across workspaces.
# -----------------------------------------------------------------------------
review_find_chatgpt_pane() {
    local tool="$1" target="$2"
    case "$tool" in
        cmux) _review_find_cmux_surface "$target" ;;
        rex)  _review_find_rex_pane "$target" ;;
        *)
            echo "review_find_chatgpt_pane: unknown tool '$tool' (use cmux|rex)" >&2
            exit 2
            ;;
    esac
}

# cmux: exact tab-title match by surface kind (terminal only). Terminals are
# addressed by name or surface:N, so exact title matching is correct there.
_review_find_cmux_surface_by_kind() {
    local kind="$1" target="$2"
    if [[ "$target" == surface:* ]]; then
        printf '%s\n' "$target"
        return 0
    fi
    _review_setup_socket cmux
    local workspace="${CMUX_WORKSPACE_ID:-workspace:1}"
    local match
    match="$(cmux tree --workspace "$workspace" 2>/dev/null \
        | awk -v kind="[${kind}]" -v quoted="\"${target}\"" '
            index($0, "surface surface:") && index($0, kind) && index($0, quoted) {
                if (match($0, /surface:[0-9]+/)) { print substr($0, RSTART, RLENGTH); exit }
            }')"

    if [[ -z "$match" ]]; then
        echo "No ${kind} surface with exact tab title: ${target}" >&2
        echo "Current ${kind} surfaces:" >&2
        cmux tree --workspace "$workspace" 2>/dev/null | rg "\[${kind}\]" >&2 || true
        exit 1
    fi
    printf '%s\n' "$match"
}

# cmux browser surface lookup (the review path). Resolves by URL, not tab title.
_review_find_cmux_surface() {
    _review_find_cmux_chatgpt_surface "$1"
}

# Resolve the closest ChatGPT (or any) browser surface for a cmux review send.
# A surface:N target is used verbatim. Any other target (chatgpt | browser | <name>)
# resolves to a qualifying browser surface by what it shows, never by tab title:
#   chatgpt | <name>  -> a surface showing a https://chatgpt.com page
#   browser           -> any browser surface
# "Closest" = a qualifying surface in the caller's own workspace (the workspace of
# the terminal that invoked the review, from `cmux identify`), else the first
# qualifying surface anywhere. This mirrors the rex path's "closest in origin task"
# semantics so a review never jumps to a ChatGPT pane in an unrelated workspace.
_review_find_cmux_chatgpt_surface() {
    local target="$1"
    if [[ "$target" == surface:* ]]; then
        printf '%s\n' "$target"
        return 0
    fi
    _review_setup_socket cmux

    local want_any_browser=0
    [[ "$target" == "browser" ]] && want_any_browser=1

    local caller_ws tree
    caller_ws="$(cmux identify --json 2>/dev/null \
        | grep -m1 '"workspace_ref"' \
        | sed -E 's/.*"workspace_ref"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    tree="$(cmux tree 2>/dev/null || true)"

    # One record per qualifying browser surface: "ws\tsurface:N". Track the
    # workspace each surface lives in (the last workspace line seen above it).
    local parsed
    parsed="$(printf '%s\n' "$tree" | awk -v any="$want_any_browser" '
        function qual() {
            if ($0 !~ /\[browser\]/) return 0
            return (any || $0 ~ /https:\/\/chatgpt\.com/)
        }
        /workspace workspace:/ {
            if (match($0, /workspace:[0-9]+/)) cur_ws = substr($0, RSTART, RLENGTH)
            next
        }
        /surface surface:/ {
            if (!qual()) next
            if (match($0, /surface:[0-9]+/)) printf "%s\t%s\n", cur_ws, substr($0, RSTART, RLENGTH)
        }
    ')"

    local chosen=""
    if [[ -n "$caller_ws" ]]; then
        chosen="$(printf '%s\n' "$parsed" | awk -F'\t' -v ws="$caller_ws" '$1==ws && $2 ~ /surface:/{print $2; exit}')"
    fi
    if [[ -z "$chosen" ]]; then
        chosen="$(printf '%s\n' "$parsed" | awk -F'\t' '$2 ~ /surface:/{print $2; exit}')"
    fi

    if [[ -z "$chosen" ]]; then
        echo "No ChatGPT browser surface found (target='$target')." >&2
        echo "Browser surfaces:" >&2
        printf '%s\n' "$tree" | grep -E "\[browser\]" >&2 || true
        exit 1
    fi
    printf '%s\n' "$chosen"
}

# Predicate: does this raw Rex tree pane line match the review target?
#   chatgpt -> pane is showing ChatGPT
#   browser -> any browser pane (content=Browser, with ChatGPT url as fallback)
#   <name>  -> a browser/ChatGPT pane whose name equals the target
_review_rex_target_matches() {
    local target="$1" raw="$2"
    case "$target" in
        chatgpt) [[ "$raw" == *browserUrl=https://chatgpt.com* ]] ;;
        browser) [[ "$raw" == *content=Browser* || "$raw" == *browserUrl=https://chatgpt.com* ]] ;;
        *) [[ "$raw" == *" name=$target "* && ( "$raw" == *content=Browser* || "$raw" == *browserUrl=https://chatgpt.com* ) ]] ;;
    esac
}

# Pick the first parsed candidate matching the target. mode "closest" restricts
# to the origin task; mode "any" accepts any task (the prior global behavior).
# Parsed records on stdin:
#   "active\t<task>" | "origintask\t<task>" | "cand\t<task>\t<pane>\t<raw>"
_review_rex_pick_pane() {
    local target="$1" origin="$2" mode="$3" kind f1 f2 f3
    while IFS=$'\t' read -r kind f1 f2 f3; do
        [[ "$kind" != "cand" ]] && continue
        [[ "$mode" == "closest" && "$f1" != "$origin" ]] && continue
        if _review_rex_target_matches "$target" "$f3"; then
            printf '%s\n' "$f2"
            return 0
        fi
    done
    return 1
}

# rex: folds the former rex-review-find-browser-pane.sh. Auto-targets
# (chatgpt | browser | <name>) resolve to the qualifying pane in the SAME task
# (workspace) as the origin - i.e. the one closest to the current pane - rather
# than the first matching pane across all tasks.
_review_find_rex_pane() {
    local target="${1:-chatgpt}"
    local sock
    sock="$(review_socket_path rex)"
    if [[ ! -S "$sock" ]]; then
        echo "Rex socket not found: $sock" >&2
        exit 1
    fi
    local tree
    tree="$(printf 'tree\n' | nc -U "$sock")"

    if [[ "$target" == pane:* ]]; then
        local pane="${target#pane:}"
        local line
        line="$(printf '%s\n' "$tree" | grep -F "pane:${pane} " || true)"
        if [[ -n "$line" ]] && { [[ "$line" == *content=Browser* ]] || [[ "$line" == *browserUrl=https://chatgpt.com* ]]; }; then
            printf 'pane:%s\n' "$pane"
            exit 0
        fi
        echo "Browser pane not found: $target" >&2
        exit 1
    fi

    # Auto-resolve (chatgpt | browser | <name>). Prefer the qualifying pane in
    # the SAME task (workspace) as the origin, so a review never jumps to a
    # ChatGPT pane in an unrelated task. Origin task, most specific first:
    #   REX_REVIEW_ORIGIN_TASK  -> explicit task id
    #   REX_REVIEW_ORIGIN_PANE  -> task containing that pane id
    #   else                    -> active task (activeTask=)
    # A pane qualifies if it is a browser pane (content=Browser) or is showing
    # ChatGPT (browserUrl=https://chatgpt.com); the target filters further.
    local parsed active_task="" origin_task_found=""
    parsed="$(printf '%s\n' "$tree" | awk -v O_PANE="${REX_REVIEW_ORIGIN_PANE:-}" '
        function strip(s, prefix,   plen) { plen = length(prefix); return substr(s, plen + 1) }
        /^activeTask=/ {
            if (match($0, /activeTask=[0-9a-f-]+/)) active_task = strip(substr($0, RSTART, RLENGTH), "activeTask=")
            next
        }
        {
            if (match($0, /task:[0-9a-f-]+/)) cur_task = strip(substr($0, RSTART, RLENGTH), "task:")
        }
        /pane:/ {
            if (!match($0, /pane:[0-9a-f-]+/)) next
            pane_id = strip(substr($0, RSTART, RLENGTH), "pane:")
            if (O_PANE != "" && O_PANE == pane_id && cur_task != "") origin_task_found = cur_task
            if ($0 ~ /content=Browser/ || $0 ~ /browserUrl=https:\/\/chatgpt\.com/) {
                printf "cand\t%s\t%s\t%s\n", cur_task, pane_id, $0
            }
        }
        END {
            printf "active\t%s\n", active_task
            if (origin_task_found != "") printf "origintask\t%s\n", origin_task_found
        }
    ')"

    local origin="${REX_REVIEW_ORIGIN_TASK:-}"
    local kind f1 f2 f3
    while IFS=$'\t' read -r kind f1 f2 f3; do
        [[ -z "$kind" ]] && continue
        case "$kind" in
            active) active_task="$f1" ;;
            origintask) origin_task_found="$f1" ;;
        esac
    done <<< "$parsed"
    [[ -z "$origin" ]] && origin="${origin_task_found:-$active_task}"

    local chosen=""
    chosen="$(_review_rex_pick_pane "$target" "$origin" closest <<< "$parsed")"
    if [[ -z "$chosen" ]]; then
        chosen="$(_review_rex_pick_pane "$target" "$origin" any <<< "$parsed")"
    fi

    if [[ -z "$chosen" ]]; then
        echo "No matching Rex browser pane for target '$target'." >&2
        echo "Available browser panes:" >&2
        printf '%s\n' "$tree" | awk '/content=Browser/ || /browserUrl=https:\/\/chatgpt.com/ { print "  " $0 }' >&2
        exit 1
    fi
    printf 'pane:%s\n' "$chosen"
}

# -----------------------------------------------------------------------------
# Transport primitives.
# -----------------------------------------------------------------------------

# Print the normalized page URL (https://...) for the handle.
review_get_url() {
    local tool="$1" handle="$2"
    case "$tool" in
        cmux)
            if ! _review_resolve_cmux_bin; then
                _review_cmux_not_found_message "review_get_url"
                return 1
            fi
            _review_setup_socket cmux
            # Fail loud on a cmux read failure or an empty response (e.g. daemon
            # unreachable / broken pipe / bad handle) so a dead read is not
            # silently mistaken for "not ChatGPT". The previous `|| true` +
            # `2>/dev/null` swallowed these and yielded an empty URL, which made
            # review_is_chatgpt return 1 and falsely refuse a legitimate surface.
            local cmux_url
            if ! cmux_url="$(cmux browser "$handle" get url 2>&1)"; then
                echo "review_get_url: cmux browser get url failed for $handle: ${cmux_url:-<no response>}" >&2
                return 1
            fi
            cmux_url="${cmux_url//$'\r'/}"
            cmux_url="${cmux_url//$'\n'/}"
            if [[ -z "$cmux_url" ]]; then
                echo "review_get_url: empty url from cmux for $handle (daemon unreachable or bad handle)" >&2
                return 1
            fi
            printf '%s\n' "$cmux_url"
            ;;
        rex)
            local sock raw url
            sock="$(review_socket_path rex)"
            # Rex returns a status line: "ok <pane> url=<val> title=... tab=...".
            # Fail loud on a socket/read error or a malformed response so a dead
            # read is not silently mistaken for "not ChatGPT".
            if ! raw="$(printf 'browser-url %s\n' "$handle" | nc -U "$sock" 2>&1)"; then
                echo "review_get_url: Rex browser-url read failed for $handle: ${raw:-<no response>}" >&2
                return 1
            fi
            url="$(printf '%s\n' "$raw" | grep -oE 'url=https://[^ ]+' | sed 's/^url=//')"
            if [[ -z "$url" ]]; then
                echo "review_get_url: no url= in Rex response for $handle: ${raw:-<empty>}" >&2
                return 1
            fi
            printf '%s\n' "$url"
            ;;
        *)
            echo "review_get_url: unknown tool '$tool' (use cmux|rex)" >&2
            exit 2
            ;;
    esac
}

# Return 0 if the handle is on a ChatGPT tab, 1 otherwise.
review_is_chatgpt() {
    local tool="$1" handle="$2"
    local url
    url="$(review_get_url "$tool" "$handle")"
    [[ "$url" == https://chatgpt.com/* ]]
}

# Submit a prompt to the ChatGPT composer. Exits 1 if submission is not confirmed.
# <prompt> is the literal prompt text (not a file path).
review_submit() {
    local tool="$1" handle="$2" prompt="$3"
    case "$tool" in
        cmux)
            _review_setup_socket cmux
            local composer='#prompt-textarea'
            local send_button='button[data-testid="send-button"]'
            if ! cmux browser "$handle" is visible "$composer" >/dev/null 2>&1; then
                echo "Refusing browser send: ChatGPT composer ${composer} is not visible on ${handle}." >&2
                exit 1
            fi
            if ! cmux browser "$handle" fill "$composer" --text "$prompt" >/dev/null 2>&1; then
                echo "Browser send failed: could not fill the ChatGPT composer on ${handle}." >&2
                exit 1
            fi
            if ! cmux browser "$handle" wait --selector "$send_button" --timeout-ms 5000 >/dev/null 2>&1; then
                echo "Browser send failed: ChatGPT send button did not become available on ${handle}." >&2
                exit 1
            fi
            if ! cmux browser "$handle" click "$send_button" >/dev/null 2>&1; then
                echo "Browser send failed: could not click the ChatGPT send button on ${handle}." >&2
                exit 1
            fi
            ;;
        rex)
            local sock
            sock="$(review_socket_path rex)"
            local response
            response="$(printf 'browser-submit %s %s\n' "$handle" "$prompt" | nc -U "$sock")"
            printf '%s\n' "$response"
            if [[ "$response" == error* ]]; then
                exit 1
            fi
            if [[ "$response" != ok* || "$response" != *" submitted "* ]]; then
                echo "Browser send was not confirmed submitted; refusing to poll stale or unsent text." >&2
                exit 1
            fi
            ;;
        *)
            echo "review_submit: unknown tool '$tool' (use cmux|rex)" >&2
            exit 2
            ;;
    esac
}

# Print the visible body text of the pane.
review_read_body() {
    local tool="$1" handle="$2"
    case "$tool" in
        cmux)
            _review_setup_socket cmux
            cmux browser "$handle" get text body 2>/dev/null || true
            ;;
        rex)
            local sock raw header
            sock="$(review_socket_path rex)"
            # Rex returns "ok <pane> chars=N mode=embedded\n<body>". Fail loud
            # on a socket/read error or an unexpected header: the orchestrator must
            # distinguish "could not read the pane" from "answer not there yet".
            if ! raw="$(printf 'browser-text %s 30000\n' "$handle" | nc -U "$sock" 2>&1)"; then
                echo "review_read_body: Rex browser-text read failed for $handle: ${raw:-<no response>}" >&2
                return 1
            fi
            header="${raw%%$'\n'*}"
            if [[ "$header" != "ok "* ]]; then
                echo "review_read_body: unexpected Rex response for $handle (expected 'ok ...'): ${raw:-<empty>}" >&2
                return 1
            fi
            # Drop the status header line; print only the page text.
            printf '%s\n' "${raw#*$'\n'}"
            ;;
        *)
            echo "review_read_body: unknown tool '$tool' (use cmux|rex)" >&2
            exit 2
            ;;
    esac
}

# Resolve and verify a ChatGPT browser target, then submit one prompt file.
review_send_prompt_file() {
    local tool="$1" target="$2" prompt_file="$3"
    if [[ ! -f "$prompt_file" ]]; then
        echo "Prompt file not found: $prompt_file" >&2
        return 2
    fi

    local handle
    handle="$(review_find_chatgpt_pane "$tool" "$target")"
    if ! review_is_chatgpt "$tool" "$handle"; then
        echo "Refusing browser send: ${handle} is not a ChatGPT tab." >&2
        return 1
    fi

    review_submit "$tool" "$handle" "$(<"$prompt_file")"
}
