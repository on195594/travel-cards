#!/usr/bin/env bash
set -euo pipefail

port="$(node -e 'const n=require("node:net"); const s=n.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
base="http://127.0.0.1:${port}"
api_token="test-http-token-at-least-16-chars"
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
HERMES_API_TOKEN="$api_token" \
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

HERMES_API_TOKEN="$api_token" node --input-type=module - "$base" <<'NODE'
import assert from "node:assert/strict";

const base = process.argv[2];
const token = process.env.HERMES_API_TOKEN;
const authHeaders = { authorization: `Bearer ${token}`, "content-type": "application/json" };

function assertNoStore(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
}

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

const payload = {
  title: "HTTP smoke published guide",
  slug: "smoke-published-guide",
  destination: "Fixture",
  excerpt: "Controlled visibility fixture",
  days: 1,
  coverImage: {
    objectKey: "guides/smoke.png",
    publicUrl: "https://images.example.test/guides/smoke.png",
    alt: "Synthetic cover",
  },
  itinerary: [{ day: 1, title: "Day one", items: [{ place: "Fixture", description: "Smoke" }] }],
  sections: [],
  sources: [],
  publish: true,
};

const created = await json("/api/guides", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify(payload),
});
assert.equal(created.response.status, 201);
assertNoStore(created.response);
assert.equal(created.body.guide.status, "published");
let guide = created.body.guide;

for (const path of ["/", "/?q=smoke", "/api/guides", "/api/guides?q=smoke", `/guides/${payload.slug}`, "/sitemap.xml"]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assertNoStore(response);
  assert.match(await response.text(), /smoke|HTTP smoke published guide/, path);
}

const adminList = await fetch(`${base}/api/guides?scope=admin`, {
  headers: { authorization: `Bearer ${token}` },
});
assert.equal(adminList.status, 200);
assertNoStore(adminList);
assert.match(adminList.headers.get("cache-control") ?? "", /private/);

const updated = await json(`/api/guides/${guide.id}`, {
  method: "PATCH",
  headers: authHeaders,
  body: JSON.stringify({ expectedRevision: guide.revision, title: "HTTP smoke updated public title" }),
});
assert.equal(updated.response.status, 200);
assertNoStore(updated.response);
guide = updated.body.guide;
const updatedHtml = await fetch(`${base}/guides/${payload.slug}`);
assert.equal(updatedHtml.status, 200);
assertNoStore(updatedHtml);
assert.match(await updatedHtml.text(), /<title>HTTP smoke updated public title/);
const updatedPage = await fetch(`${base}/guides/${payload.slug}`, { headers: { RSC: "1" } });
assert.equal(updatedPage.status, 200);
assertNoStore(updatedPage);
assert.match(updatedPage.headers.get("content-type") ?? "", /text\/x-component/);
assert.match(await updatedPage.text(), /HTTP smoke updated public title/);

const unpublished = await json(`/api/guides/${guide.id}/unpublish`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ expectedRevision: guide.revision }),
});
assert.equal(unpublished.response.status, 200);
assertNoStore(unpublished.response);
guide = unpublished.body.guide;

for (const path of ["/", "/?q=smoke", "/api/guides", "/api/guides?q=smoke", "/sitemap.xml"]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assertNoStore(response);
  assert.doesNotMatch(await response.text(), /smoke-published-guide/, path);
}
const withdrawnPage = await fetch(`${base}/guides/${payload.slug}`);
assert.equal(withdrawnPage.status, 404);
assert.doesNotMatch(await withdrawnPage.text(), /HTTP smoke updated public title/);
const withdrawnRsc = await fetch(`${base}/guides/${payload.slug}`, { headers: { RSC: "1" } });
assert.ok([200, 404].includes(withdrawnRsc.status));
assertNoStore(withdrawnRsc);
assert.match(withdrawnRsc.headers.get("content-type") ?? "", /text\/x-component/);
assert.doesNotMatch(await withdrawnRsc.text(), /HTTP smoke updated public title/);

const republished = await json(`/api/guides/${guide.id}/publish`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ expectedRevision: guide.revision }),
});
assert.equal(republished.response.status, 200);
assert.equal(republished.body.guide.status, "published");
guide = republished.body.guide;
assert.equal((await fetch(`${base}/guides/${payload.slug}`)).status, 200);

const deleted = await json(`/api/guides/${guide.id}`, {
  method: "DELETE",
  headers: authHeaders,
  body: JSON.stringify({ expectedRevision: guide.revision }),
});
assert.equal(deleted.response.status, 204);
assertNoStore(deleted.response);

const deletedAdmin = await fetch(`${base}/api/guides/${guide.id}`, {
  headers: { authorization: `Bearer ${token}` },
});
assert.equal(deletedAdmin.status, 404);
assertNoStore(deletedAdmin);
for (const path of ["/", "/?q=smoke", "/api/guides", "/api/guides?q=smoke", "/sitemap.xml"]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assertNoStore(response);
  assert.doesNotMatch(await response.text(), /smoke-published-guide/, path);
}
assert.equal((await fetch(`${base}/guides/${payload.slug}`)).status, 404);

console.log("http-content-smoke PASS direct-publish/update/unpublish/republish/delete no-store HTML+RSC visibility");
NODE

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
