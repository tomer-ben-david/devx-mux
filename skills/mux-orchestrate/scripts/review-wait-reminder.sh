#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: review-wait-reminder.sh <surface-or-pane> [seconds]" >&2
    exit 2
fi

target="$1"
delay="${2:-300}"
if [[ ! "$delay" =~ ^[0-9]+$ ]]; then
    echo "Delay must be a non-negative integer: $delay" >&2
    exit 2
fi

sleep "$delay"
printf 'Review exists on %s and is ready for the agent to check now. Completion is unknown; this script did not inspect it.\n' "$target"
exit 0
