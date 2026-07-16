#!/usr/bin/env bash
# cmux-review-poll.sh - cmux thin wrapper over review-common.sh.
#
# Usage:
#   cmux-review-poll.sh browser <surface|tab-name> [REQUEST_ID=<id>] [AFTER_ASSISTANT_COUNT=<n>]
#   cmux-review-poll.sh browser <surface|tab-name> COUNT_ONLY
#
# Reads the ChatGPT browser body once via cmux. Does not send prompts.
# The orchestrator owns sleep/backoff; the optional assistant-count boundary
# withholds stale, empty, and partially generated responses.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  cmux-review-poll.sh browser <surface|tab-name> [REQUEST_ID=<id>] [AFTER_ASSISTANT_COUNT=<n>]
  cmux-review-poll.sh browser <surface|tab-name> COUNT_ONLY

Reads the ChatGPT browser body once via cmux. Does not send prompts.
The optional assistant-count boundary withholds stale, empty, and partially generated responses.
EOF
}

if [[ $# -lt 2 || $# -gt 4 ]]; then
    usage >&2
    exit 2
fi

mode="$1"
surface="$2"
request_id=""
after_count=""
count_only=0
for option in "${@:3}"; do
    case "$option" in
        REQUEST_ID=*) request_id="$option" ;;
        AFTER_ASSISTANT_COUNT=*) after_count="${option#AFTER_ASSISTANT_COUNT=}" ;;
        COUNT_ONLY) count_only=1 ;;
        *) usage >&2; exit 2 ;;
    esac
done

if [[ "$mode" != browser ]]; then
    usage >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"

if [[ "$count_only" -eq 1 ]]; then
    review_assistant_count cmux "$surface"
else
    review_poll_latest_answer cmux "$surface" "$request_id" "$after_count"
fi
