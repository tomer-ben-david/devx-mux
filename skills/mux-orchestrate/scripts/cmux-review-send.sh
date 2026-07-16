#!/usr/bin/env bash
# cmux-review-send.sh - cmux thin wrapper over review-common.sh.
#
# Browser review-send logic lives once in review-common.sh (shared with the
# Rex review loop). Only the cmux-only *terminal* mode is handled here, since
# it has no Rex equivalent and therefore nothing to share.
#
# Usage:
#   cmux-review-send.sh terminal <surface> <prompt-file>
#   cmux-review-send.sh browser  <surface|tab-name> <prompt-file>
#
# Examples:
#   cmux-review-send.sh terminal surface:2 /tmp/review-prompt.txt
#   cmux-review-send.sh browser  surface:21 /tmp/chatgpt-prompt.txt
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  cmux-review-send.sh terminal <surface> <prompt-file>
  cmux-review-send.sh browser  <surface|tab-name> <prompt-file>

Examples:
  cmux-review-send.sh terminal surface:2 /tmp/review-prompt.txt
  cmux-review-send.sh browser  surface:21 /tmp/chatgpt-prompt.txt
EOF
}

if [[ $# -ne 3 ]]; then
    usage >&2
    exit 2
fi

mode="$1"
surface="$2"
prompt_file="$3"

if [[ ! -f "$prompt_file" ]]; then
    echo "Prompt file not found: $prompt_file" >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"

case "$mode" in
    terminal)
        # cmux-only: send to a terminal surface. No Rex equivalent, so not shared
        # through review_submit; the surface lookup itself still reuses the common
        # cmux tree-find helper (terminal kind).
        surface="$(_review_find_cmux_surface_by_kind terminal "$surface")"
        prompt="$(cat "$prompt_file")"
        cmux send --surface "$surface" "$prompt"
        # Large prompts can still be settling into the terminal/editor when cmux
        # returns. Give the input a short deterministic beat before submitting.
        sleep "${CMUX_REVIEW_TERMINAL_SUBMIT_DELAY:-0.5}"
        cmux send-key --surface "$surface" enter
        ;;
    browser)
        review_send_prompt_file cmux "$surface" "$prompt_file"
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
