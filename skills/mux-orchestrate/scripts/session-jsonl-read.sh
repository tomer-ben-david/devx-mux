#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--seed" ]]; then
    shift
    exec node "$script_dir/session-jsonl.ts" seed "$@"
fi
exec node "$script_dir/session-jsonl.ts" read "$@"
