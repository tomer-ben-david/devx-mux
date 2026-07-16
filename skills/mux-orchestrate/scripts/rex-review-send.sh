#!/usr/bin/env bash
# rex-review-send.sh - Rex thin wrapper over review-common.sh.
#
# Usage:
#   rex-review-send.sh <chatgpt|browser|pane:id|pane-name> <prompt-file>
#
# Examples:
#   rex-review-send.sh chatgpt /tmp/rex-review-prompt.txt
#   rex-review-send.sh pane:2d1169ef-1cd4-498b-b4f4-60d289afb8a9 /tmp/rex-review-prompt.txt
set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  rex-review-send.sh <chatgpt|browser|pane:id|browser-name> <prompt-file>

Examples:
  rex-review-send.sh chatgpt /tmp/rex-review-prompt.txt
  rex-review-send.sh pane:2d1169ef-1cd4-498b-b4f4-60d289afb8a9 /tmp/rex-review-prompt.txt
EOF
}

if [[ $# -ne 2 ]]; then
    usage >&2
    exit 2
fi

target="$1"
prompt_file="$2"
if [[ ! -f "$prompt_file" ]]; then
    echo "Prompt file not found: $prompt_file" >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"

review_send_prompt_file rex "$target" "$prompt_file"
