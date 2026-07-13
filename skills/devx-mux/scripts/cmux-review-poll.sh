#!/usr/bin/env bash
# cmux-review-poll.sh - cmux thin wrapper over review-common.sh.
#
# Usage:
#   cmux-review-poll.sh browser <surface|tab-name> [REQUEST_ID=<id>]
#
# Reads the ChatGPT browser body once via cmux. Does not send prompts.
# The orchestrator owns sleep/backoff and decides when the answer is complete.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  cmux-review-poll.sh browser <surface|tab-name> [REQUEST_ID=<id>]

Reads the ChatGPT browser body once via cmux. Does not send prompts.
The orchestrator owns sleep/backoff and decides when the answer is complete.
EOF
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
    usage >&2
    exit 2
fi

mode="$1"
surface="$2"
request_id="${3:-}"

if [[ "$mode" != browser ]]; then
    usage >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"

review_poll_latest_answer cmux "$surface" "$request_id"
