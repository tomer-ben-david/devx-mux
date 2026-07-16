#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || ! "$1" =~ ^(cmux|rex)$ ]]; then
    echo "Usage: review-resolve-target.sh <cmux|rex> <target>" >&2
    exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=review-common.sh
source "$script_dir/review-common.sh"
review_find_chatgpt_pane "$1" "$2"
