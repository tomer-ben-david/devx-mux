#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Missing required command: node" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "DevX Crew is not set up. Run ./run.sh setup first." >&2
  exit 1
fi

if [ ! -f apps/cli/dist/main.js ]; then
  npm run build
fi

exec node apps/cli/dist/main.js "$@"

