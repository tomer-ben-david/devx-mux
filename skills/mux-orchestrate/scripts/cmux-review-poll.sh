#!/usr/bin/env bash
# cmux-review-poll.sh - compatibility wrapper over the checked TypeScript poller.
#
# Usage:
#   cmux-review-poll.sh browser <surface|tab-name> REQUEST_ID=<id>
#
# Reads ChatGPT once through cmux semantic browser commands. Does not send prompts.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  cmux-review-poll.sh browser <surface|tab-name> REQUEST_ID=<id>

Reads the ChatGPT browser body once via cmux. Does not send prompts.
The request ID withholds stale, empty, and partially generated responses.
EOF
}

if [[ $# -ne 3 ]]; then
    usage >&2
    exit 2
fi

mode="$1"
surface="$2"
boundary="$3"
if [[ "$boundary" != REQUEST_ID=* && "$boundary" != TURN_TOKEN=* && "$boundary" != ADOPT_TOKEN=* ]]; then usage >&2; exit 2; fi

if [[ "$mode" != browser ]]; then
    usage >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_dir/chatgpt-review-poll.mjs" cmux "$surface" "$boundary"
