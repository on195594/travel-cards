#!/usr/bin/env bash
set -euo pipefail

run_id="$(date +%s)_$$"
container="travel-cards-test-${run_id//_/-}"
database="travel_cards_test_${run_id}"
label="travel-cards.test-run=${run_id}"

cleanup() {
  if docker inspect "$container" >/dev/null 2>&1; then
    actual="$(docker inspect --format '{{ index .Config.Labels "travel-cards.test-run" }}' "$container")"
    if [[ "$actual" != "$run_id" ]]; then
      printf 'Refusing to remove unowned MongoDB container %s\n' "$container" >&2
      return 1
    fi
    docker rm -f "$container" >/dev/null
  fi
}
trap cleanup EXIT INT TERM

docker run -d --name "$container" --label "$label" -p 127.0.0.1::27017 mongo:8 --quiet >/dev/null
mapping="$(docker port "$container" 27017/tcp)"
port="${mapping##*:}"
export TRAVEL_CARDS_TEST_RUN_ID="$run_id"
export TRAVEL_CARDS_TEST_MONGO_CONTAINER="$container"
export MONGODB_URI="mongodb://127.0.0.1:${port}/${database}"

ready=false
for _ in {1..60}; do
  if node -e 'const mongoose=require("mongoose"); mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:500}).then(()=>mongoose.disconnect()).then(()=>process.exit(0),()=>process.exit(1))'; then
    ready=true
    break
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  docker logs "$container" >&2
  exit 1
fi

"$@"
