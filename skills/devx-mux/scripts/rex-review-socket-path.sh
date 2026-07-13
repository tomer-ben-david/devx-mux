#!/usr/bin/env bash
set -euo pipefail

case "$(uname -s 2>/dev/null || printf unknown)" in
  Darwin*)
    printf '%s\n' "$HOME/Library/Application Support/rexide/rexide.sock"
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    base="${APPDATA:-$HOME/AppData/Roaming}"
    printf '%s\n' "$base/rexide/rexide.sock"
    ;;
  *)
    base="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}}"
    printf '%s\n' "$base/rexide/rexide.sock"
    ;;
esac
