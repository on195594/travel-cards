#!/usr/bin/env bash
set -euo pipefail

port="$(node -e 'const n=require("node:net"); const s=n.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
base="http://127.0.0.1:${port}"
log="$(mktemp)"
app_pid=""
mongo_paused=false

cleanup() {
  if [[ "$mongo_paused" == true ]]; then
    owner="$(docker inspect --format '{{ index .Config.Labels "travel-cards.test-run" }}' "$TRAVEL_CARDS_TEST_MONGO_CONTAINER" 2>/dev/null || true)"
    if [[ "$owner" == "$TRAVEL_CARDS_TEST_RUN_ID" ]]; then
      docker unpause "$TRAVEL_CARDS_TEST_MONGO_CONTAINER" >/dev/null || true
    fi
  fi
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill "$app_pid"
    wait "$app_pid" 2>/dev/null || true
  fi
  rm -f "$log"
}
trap cleanup EXIT INT TERM

AUTH_SECRET="test-only-secret-that-is-at-least-32-characters" \
AUTH_URL="$base" \
ADMIN_EMAIL="admin@example.test" \
ADMIN_PASSWORD_HASH='scrypt$00$00' \
HOSTNAME=127.0.0.1 PORT="$port" node .next/standalone/server.js >"$log" 2>&1 &
app_pid=$!

wait_for_status() {
  local path="$1" expected="$2"
  for _ in {1..60}; do
    if STATUS_EXPECTED="$expected" node -e 'fetch(process.argv[1]).then(r=>process.exit(r.status===Number(process.env.STATUS_EXPECTED)?0:1),()=>process.exit(1))' "$base$path"; then
      return 0
    fi
    sleep 0.5
  done
  printf 'Timed out waiting for %s -> %s\n' "$path" "$expected" >&2
  python - "$log" <<'PY' >&2
from pathlib import Path
import sys
print("\n".join(Path(sys.argv[1]).read_text().splitlines()[:160]))
PY
  return 1
}

wait_for_status /api/health/live 200
wait_for_status /api/health/ready 200

owner="$(docker inspect --format '{{ index .Config.Labels "travel-cards.test-run" }}' "$TRAVEL_CARDS_TEST_MONGO_CONTAINER")"
if [[ "$owner" != "$TRAVEL_CARDS_TEST_RUN_ID" ]]; then
  printf 'Refusing to pause an unowned MongoDB container\n' >&2
  exit 1
fi
docker pause "$TRAVEL_CARDS_TEST_MONGO_CONTAINER" >/dev/null
mongo_paused=true
wait_for_status /api/health/live 200
wait_for_status /api/health/ready 503
docker unpause "$TRAVEL_CARDS_TEST_MONGO_CONTAINER" >/dev/null
mongo_paused=false
wait_for_status /api/health/ready 200
