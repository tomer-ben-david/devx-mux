#!/usr/bin/env bash
# Resolve the live cmux Unix socket path.
# Prefers CMUX_SOCKET_PATH when set, then probes known install locations.
set -euo pipefail

cmux_socket_candidates() {
  if [[ -n "${CMUX_SOCKET_PATH:-}" ]]; then
    printf '%s\n' "$CMUX_SOCKET_PATH"
  fi
  case "$(uname -s 2>/dev/null || printf unknown)" in
    Darwin*)
      printf '%s\n' \
        "$HOME/.local/state/cmux/cmux.sock" \
        "$HOME/Library/Application Support/cmux/cmux.sock"
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      base="${LOCALAPPDATA:-$HOME/AppData/Local}"
      printf '%s\n' "$base/cmux/cmux.sock"
      ;;
    *)
      base="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}}"
      printf '%s\n' "$base/cmux/cmux.sock"
      ;;
  esac
  printf '%s\n' \
    /tmp/cmux.sock \
    /tmp/cmux-debug.sock \
    /tmp/cmux-nightly.sock \
    /tmp/cmux-staging.sock
}

socket_accepts_connection() {
  local sock="$1"
  [[ -S "$sock" ]] || return 1
  CMUX_SOCKET_PATH="$sock" cmux tree >/dev/null 2>&1
}

default_socket_path() {
  case "$(uname -s 2>/dev/null || printf unknown)" in
    Darwin*) printf '%s\n' "$HOME/.local/state/cmux/cmux.sock" ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      base="${LOCALAPPDATA:-$HOME/AppData/Local}"
      printf '%s\n' "$base/cmux/cmux.sock"
      ;;
    *)
      base="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}}"
      printf '%s\n' "$base/cmux/cmux.sock"
      ;;
  esac
}

while IFS= read -r candidate; do
  [[ -n "$candidate" ]] || continue
  if socket_accepts_connection "$candidate"; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done < <(cmux_socket_candidates | awk '!seen[$0]++')

default_socket_path
