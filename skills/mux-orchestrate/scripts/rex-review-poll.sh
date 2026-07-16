#!/usr/bin/env bash
# rex-review-poll.sh - compatibility wrapper over the checked TypeScript poller.
#
# Usage:
#   rex-review-poll.sh <pane:id|chatgpt|browser|pane-name> <request-or-turn-token>
#
# Reads the Rex browser pane once. It never sends follow-up prompts. The shared
# poller withholds empty or partially generated responses and verifies the
# exact request boundary. The orchestrator owns sleep/backoff.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  rex-review-poll.sh <pane:id|chatgpt|browser|pane-name> <request-or-turn-token>

Reads the Rex browser pane once. It never sends follow-up prompts.
The shared poller withholds empty or partially generated responses and verifies the exact request boundary.
The orchestrator owns sleep/backoff.
EOF
}

if [[ $# -ne 2 ]]; then
    usage >&2
    exit 2
fi

target="$1"
boundary="$2"
if [[ "$boundary" != REQUEST_ID=* && "$boundary" != REQUEST_TOKEN=* && "$boundary" != TURN_TOKEN=* && "$boundary" != ADOPT_TOKEN=* && "$boundary" != READY_TOKEN=* ]]; then
    echo "Expected REQUEST_TOKEN=<token>, TURN_TOKEN=<token>, or READY_TOKEN=<token>, got $boundary" >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$script_dir/chatgpt-review-poll.mjs" rex "$target" "$boundary"
