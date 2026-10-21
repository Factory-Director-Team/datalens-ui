#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
compose=(docker compose --env-file test.env -f compose.yaml)
# Only this isolated test project's disposable containers and volumes are removed.
cleanup() { "${compose[@]}" down --volumes --remove-orphans; }
trap cleanup EXIT
mkdir -p ../artifacts/sso
"${compose[@]}" down --volumes --remove-orphans
"${compose[@]}" build
"${compose[@]}" up -d --wait proxy
"${compose[@]}" run --rm tests node node_modules/@playwright/test/cli.js test --config=tests/sso/playwright.config.ts "$@"
