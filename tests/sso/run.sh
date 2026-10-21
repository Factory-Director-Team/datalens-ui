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

# Independent full browser matrix for storage lifecycle; host/auth stay running between phases.
registry_phase() {
    "${compose[@]}" run --rm --no-deps -e SSO_REGISTRY_PHASE="$1" tests node node_modules/@playwright/test/cli.js test --config=tests/sso/playwright.config.ts
}
registry_phase prepare
"${compose[@]}" restart redis ui ui-second
"${compose[@]}" up -d --wait ui ui-second
# Refresh nginx's resolved upstream addresses after the BFF restart.
"${compose[@]}" restart proxy
registry_phase restarted
"${compose[@]}" stop redis
registry_phase unavailable
"${compose[@]}" up -d --wait redis
registry_phase restored
# This named project's disposable registry only. Simulate complete loss, never a fallback to native.
"${compose[@]}" exec -T redis redis-cli FLUSHALL
registry_phase lost
