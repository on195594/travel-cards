#!/usr/bin/env bash
set -euo pipefail

# Change to repo root
cd "$(dirname "${BASH_SOURCE[0]}")/.."

target="HEAD"
skip_tests=false
allow_dirty=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests|--no-tests)
      skip_tests=true
      shift
      ;;
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/deploy.sh [COMMIT|IMAGE] [OPTIONS]

Options:
  --skip-tests    Skip pre-deploy isolated tests (test:http)
  --allow-dirty   Allow deploying even if git working tree has uncommitted changes
  -h, --help      Show this help message

Environment variables:
  APP_PORT          Host port (default: 3100)
  MCP_OAUTH_ENABLED Optional OAuth toggle override (defaults to .env.local or false)
  MEEMO_NETWORK     Meemo backend network (default: meemo_backend)
  EDGE_NETWORK      Edge nginx network (default: nginx-network)
EOF
      exit 0
      ;;
    *)
      if [[ "$1" =~ ^- ]]; then
        printf 'Unknown option: %s\n' "$1" >&2
        exit 1
      fi
      target="$1"
      shift
      ;;
  esac
done

# Resolve image and revision
image=""
image_id=""
revision=""

if git rev-parse --verify "${target}^{commit}" >/dev/null 2>&1; then
  revision="$(git rev-parse --verify "${target}^{commit}")"
  image="travel-cards:git-${revision}"

  if [[ "$allow_dirty" != true && -n "$(git status --porcelain)" ]]; then
    printf 'Error: Working tree has uncommitted changes. Commit/stash them first or use --allow-dirty.\n' >&2
    exit 1
  fi

  if docker image inspect "$image" >/dev/null 2>&1; then
    printf 'Release image %s already exists, reusing.\n' "$image"
  else
    printf 'Building immutable release image for %s...\n' "$revision"
    ./scripts/build-release.sh "$revision"
  fi
  image_id="$(docker image inspect --format '{{.Id}}' "$image")"
elif docker image inspect "$target" >/dev/null 2>&1; then
  image="$target"
  image_id="$(docker image inspect --format '{{.Id}}' "$target")"
  revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$target" 2>/dev/null || echo "unknown")"
  printf 'Using specified image: %s (%s)\n' "$image" "$image_id"
else
  printf 'Error: Cannot resolve "%s" as a valid git commit or Docker image.\n' "$target" >&2
  exit 1
fi

# Pre-deploy verification on isolated test container
if [[ "$skip_tests" != true ]]; then
  printf 'Running isolated verification (test:http)...\n'
  TRAVEL_CARDS_TEST_IMAGE="$image" npm run test:http
fi

# Configuration and network checks
app_port="${APP_PORT:-3100}"
meemo_net="${MEEMO_NETWORK:-meemo_backend}"
edge_net="${EDGE_NETWORK:-nginx-network}"
oauth_override="${MCP_OAUTH_ENABLED:-}"

compose_cmd=(docker compose -p travel-cards)
if [[ -n "$oauth_override" ]]; then
  compose_cmd+=(-f docker-compose.yml -f docker-compose.production.yml)
fi

if ! docker network inspect "$meemo_net" >/dev/null 2>&1; then
  printf 'Error: Required network "%s" does not exist.\n' "$meemo_net" >&2
  exit 1
fi

if ! docker network inspect "$edge_net" >/dev/null 2>&1; then
  printf 'Error: Required network "%s" does not exist.\n' "$edge_net" >&2
  exit 1
fi

if ! docker inspect mongodb >/dev/null 2>&1; then
  printf 'Error: Required container "mongodb" is not running.\n' >&2
  exit 1
fi

# Validate compose configuration without exposing secrets
TRAVEL_CARDS_IMAGE="$image_id" \
MCP_OAUTH_ENABLED="${oauth_override:-false}" \
APP_PORT="$app_port" \
MEEMO_NETWORK="$meemo_net" \
EDGE_NETWORK="$edge_net" \
"${compose_cmd[@]}" config --quiet

# Capture currently running container image for rollback
old_image="$(docker inspect travel-cards-web-1 --format '{{.Image}}' 2>/dev/null || true)"
if [[ -n "$old_image" ]]; then
  docker tag "$old_image" "travel-cards:rollback" 2>/dev/null || true
fi

# Deploy
printf 'Switching web service to image %s...\n' "$image_id"
TRAVEL_CARDS_IMAGE="$image_id" \
MCP_OAUTH_ENABLED="${oauth_override:-false}" \
APP_PORT="$app_port" \
MEEMO_NETWORK="$meemo_net" \
EDGE_NETWORK="$edge_net" \
"${compose_cmd[@]}" \
  up -d --no-deps --no-build --pull never web

# Health check
printf 'Waiting for health endpoints on http://127.0.0.1:%s...\n' "$app_port"
health_ok=false
for attempt in {1..30}; do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:${app_port}/api/health/live" >/dev/null 2>&1 && \
     curl --fail --silent --max-time 2 "http://127.0.0.1:${app_port}/api/health/ready" >/dev/null 2>&1; then
    health_ok=true
    break
  fi
  sleep 1
done

if [[ "$health_ok" != true ]]; then
  printf 'Error: Health check failed after 30 seconds!\n' >&2
  "${compose_cmd[@]}" logs --tail=50 web >&2
  if [[ -n "$old_image" ]]; then
    printf 'Rolling back to previous image %s...\n' "$old_image" >&2
    TRAVEL_CARDS_IMAGE="$old_image" \
    MCP_OAUTH_ENABLED="${oauth_override:-false}" \
    APP_PORT="$app_port" \
    MEEMO_NETWORK="$meemo_net" \
    EDGE_NETWORK="$edge_net" \
    "${compose_cmd[@]}" \
      up -d --no-deps --no-build --pull never web
    printf 'Rollback completed.\n' >&2
  fi
  exit 1
fi

printf '\nDeployment successful!\n'
printf 'Container: travel-cards-web-1\n'
printf 'Image: %s (%s)\n' "$image" "$image_id"
printf 'Revision: %s\n' "$revision"
printf 'Health check: live & ready OK on port %s\n' "$app_port"
if [[ -n "$old_image" ]]; then
  printf 'Rollback alias: travel-cards:rollback (%s)\n' "$old_image"
  printf 'Rollback command: ./scripts/deploy.sh %s --skip-tests\n' "$old_image"
fi
