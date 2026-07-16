#!/usr/bin/env bash
# cmux-review-poll.sh - cmux thin wrapper over review-common.sh.
#
# Usage:
#   cmux-review-poll.sh browser <surface|tab-name> REQUEST_ID=<id>
#
# Reads the ChatGPT browser body once via cmux. Does not send prompts.
# The orchestrator owns sleep/backoff. The request ID binds the returned
# assistant node to its submitted prompt across DOM re-renders.
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
request_id=""
for option in "${@:3}"; do
    case "$option" in
        REQUEST_ID=*) request_id="$option" ;;
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

review_poll_latest_answer cmux "$surface" "$request_id"
