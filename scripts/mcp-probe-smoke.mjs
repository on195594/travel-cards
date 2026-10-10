import assert from "node:assert/strict";

const endpoint = new URL(process.argv[2] ?? "http://127.0.0.1:3000/api/mcp-probe");
assert.equal(endpoint.pathname, "/api/mcp-probe");
assert.equal(endpoint.username + endpoint.password + endpoint.search + endpoint.hash, "");
const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let id = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("mcp-session-id"), null);
  const body = await response.json();
  assert.equal(body.id, id);
  return body;
}
const initialized = await rpc("initialize", {
  protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "travel-cards-probe-smoke", version: "1" },
});
assert.equal(initialized.result.protocolVersion, "2025-11-25");
assert.deepEqual(initialized.result.capabilities, { tools: {} });
headers["mcp-protocol-version"] = initialized.result.protocolVersion;
const notification = await fetch(endpoint, {
  method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  signal: AbortSignal.timeout(10000),
});
assert.equal(notification.status, 202);
assert.equal(await notification.text(), "");
const listed = await rpc("tools/list");
assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["connection_check"]);
const called = await rpc("tools/call", { name: "connection_check", arguments: {} });
assert.equal(called.result.isError, false);
assert.match(called.result.content[0].text, /Synthetic test only/);
assert.equal((await rpc("tools/call", { name: "not_a_probe_tool", arguments: {} })).error.code, -32602);
const get = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
assert.equal(get.status, 405);
const forbidden = await fetch(endpoint, { headers: { origin: "https://untrusted.example" }, signal: AbortSignal.timeout(10000) });
assert.equal(forbidden.status, 403);
console.log("mcp-probe-smoke PASS initialize/notification/list/call/rejection; synthetic data only");
