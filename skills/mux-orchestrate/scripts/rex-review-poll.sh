#!/usr/bin/env bash
# rex-review-poll.sh - Rex thin wrapper over review-common.sh.
#
# Usage:
#   rex-review-poll.sh <pane:id|chatgpt|browser|pane-name> REQUEST_ID=<id>
#
# Reads the Rex browser pane once. It never sends follow-up prompts. The shared
# poller withholds empty or partially generated responses and verifies the
# request marker. The orchestrator owns sleep/backoff.
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  rex-review-poll.sh <pane:id|chatgpt|browser|pane-name> REQUEST_ID=<id>

Reads the Rex browser pane once. It never sends follow-up prompts.
The shared poller withholds empty or partially generated responses and verifies the request marker.
The orchestrator owns sleep/backoff.
EOF
}

if [[ $# -ne 2 ]]; then
    usage >&2
    exit 2
fi

target="$1"
request_id="$2"
if [[ "$request_id" != REQUEST_ID=* ]]; then
    echo "Expected REQUEST_ID=<id>, got $request_id" >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"

review_poll_latest_answer rex "$target" "$request_id"
