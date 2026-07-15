#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${REX_SOCKET_PATH:-}" ]]; then
  printf '%s\n' "$REX_SOCKET_PATH"
  exit 0
fi

case "$(uname -s 2>/dev/null || printf unknown)" in
  Darwin*)
    canonical="$HOME/Library/Application Support/rex/rex.sock"
    legacy="$HOME/Library/Application Support/rexide/rexide.sock"
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    base="${APPDATA:-$HOME/AppData/Roaming}"
    canonical="$base/rex/rex.sock"
    legacy="$base/rexide/rexide.sock"
    ;;
  *)
    base="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}}"
    canonical="$base/rex/rex.sock"
    legacy="$base/rexide/rexide.sock"
    ;;
esac

if [[ ! -S "$canonical" && -S "$legacy" ]]; then
  printf '%s\n' "$legacy"
else
  printf '%s\n' "$canonical"
fi
