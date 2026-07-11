#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT"

usage() {
  cat <<'EOF'
DevX Crew local runner

Usage:
  ./run.sh setup                 Install dependencies and build
  ./run.sh check                 Run tests, type checks, and build
  ./run.sh test                  Run tests
  ./run.sh typecheck             Run TypeScript verification
  ./run.sh build                 Build all packages
  ./run.sh link                  Link the `devx` command globally
  ./run.sh review [arguments]    Run `devx review`
  ./run.sh clean                 Remove generated build output
  ./run.sh help                  Show this help

Examples:
  ./run.sh review branch --dry-run
  ./run.sh review commit HEAD
  ./run.sh review local --repo /path/to/repository
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_build() {
  npm run build
}

command_name=${1:-help}
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command_name" in
  setup)
    require_command node
    require_command npm
    npm install
    run_build
    ;;
  check)
    require_command node
    require_command npm
    npm test
    npm run typecheck
    run_build
    ;;
  test)
    require_command node
    require_command npm
    npm test
    ;;
  typecheck)
    require_command node
    require_command npm
    npm run typecheck
    ;;
  build)
    require_command node
    require_command npm
    run_build
    ;;
  link)
    require_command node
    require_command npm
    run_build
    npm link --workspace @devx-crew/cli
    ;;
  review)
    require_command node
    if [ ! -f apps/cli/dist/main.js ]; then
      require_command npm
      run_build
    fi
    node apps/cli/dist/main.js review "$@"
    ;;
  clean)
    rm -rf apps/cli/dist packages/reviewer/dist
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: $command_name" >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac

