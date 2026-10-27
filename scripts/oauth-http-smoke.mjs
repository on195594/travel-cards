import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { encode } from "next-auth/jwt";

const base = process.argv[2];
const url = new URL(base);
assert.equal(url.hostname, "127.0.0.1", "OAuth smoke must stay on local loopback");
assert.equal(url.protocol, "http:");
const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
assert.match(runId ?? "", /^\d+_\d+$/, "Use the isolated MongoDB runner");
const container = process.env.TRAVEL_CARDS_TEST_MONGO_CONTAINER;
assert.equal(container, `travel-cards-test-${runId.replaceAll("_", "-")}`);
const [ownedContainer] = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }));
assert.equal(ownedContainer.Config?.Labels?.["travel-cards.test-run"], runId);
const published = ownedContainer.NetworkSettings?.Ports?.["27017/tcp"];
assert.equal(published?.length, 1);
assert.equal(published[0].HostIp, "127.0.0.1");
assert.equal(process.env.MONGODB_URI, `mongodb://127.0.0.1:${published[0].HostPort}/travel_cards_test_${runId}`);
assert.equal(process.env.MCP_OAUTH_ENABLED, "true");
assert.equal(process.env.HERMES_API_TOKEN, "test-http-token-at-least-16-chars");
const geminiOrigin = "https://gemini.google.com";
const cookieName = "authjs.session-token";
const jwt = await encode({ token: { sub: "admin", email: "admin@example.test", name: "Fake smoke admin" }, secret: "test-only-secret-that-is-at-least-32-characters", salt: cookieName, maxAge: 600 });
const session = { cookie: `${cookieName}=${jwt}` };
const callbackUri = "https://fake-client.example.test/callback";
const resource = base + "/mcp";
async function send(path, options = {}) {
  const response = await fetch(base + path, { ...options, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, path);
  if (new Headers(options.headers).get("origin") === geminiOrigin) {
    assert.equal(response.headers.get("access-control-allow-origin"), geminiOrigin, `${path}: CORS on HTTP ${response.status}`);
  }
  return response;
}
function post(path, body, headers = {}) {
  return send(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
}
for (const oldPath of ["/api/mcp", "/.well-known/oauth-protected-resource/api/mcp"]) {
  assert.equal((await fetch(base + oldPath, { redirect: "manual" })).status, 404, oldPath);
}
assert.equal((await fetch(base + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 404);
for (const path of ["/mcp", "/api/oauth/token", "/api/oauth/register", "/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-authorization-server"]) {
  const preflight = await send(path, { method: "OPTIONS", headers: { Origin: geminiOrigin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type" } });
  assert.equal(preflight.status, 204, path);
}
assert.equal((await send("/mcp", { method: "OPTIONS", headers: { Origin: "https://evil.example.test" } })).status, 403);
const anonymousMcp = await send("/mcp", { headers: { Origin: geminiOrigin } });
assert.equal(anonymousMcp.status, 401);
assert.match(anonymousMcp.headers.get("www-authenticate") ?? "", /oauth-protected-resource\/mcp/);
assert.match(anonymousMcp.headers.get("access-control-expose-headers") ?? "", /WWW-Authenticate/i);
const metadata = await send("/.well-known/oauth-authorization-server", { headers: { Origin: geminiOrigin } });
assert.equal(metadata.status, 200);
assert.equal((await metadata.json()).issuer, base);
assert.equal((await (await send("/.well-known/oauth-protected-resource/mcp")).json()).resource, resource);
for (const method of ["none", "client_secret_basic", "client_secret_post"]) {
  const registration = await send("/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json", Origin: geminiOrigin }, body: JSON.stringify({ client_name: "Fake client <script>alert(1)</script>", redirect_uris: [callbackUri], token_endpoint_auth_method: method, ...(method === "none" ? {} : { scope: "guide.read" }) }) });
  assert.equal(registration.status, 201);
  const client = await registration.json();
  const verifier = randomBytes(32).toString("base64url");
  const requestedScopes = method === "none" ? "guide.read guide.create guide.update guide.publish" : "guide.read";
  const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: callbackUri, response_type: "code", state: "s".repeat(1144), scope: requestedScopes, resource, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const anonymous = await send("/api/oauth/authorize?" + query);
  assert.equal(anonymous.status, 303);
  const login = new URL(anonymous.headers.get("location"), base);
  assert.equal(login.pathname, "/admin/login");
  assert.equal(login.searchParams.get("returnTo"), "/api/oauth/authorize?" + query);
  const authorized = await send("/api/oauth/authorize?" + query, { headers: session });
  assert.equal(authorized.status, 303);
  const consentUrl = new URL(authorized.headers.get("location"), base);
  const intent = consentUrl.searchParams.get("intent");
  const page = await fetch(consentUrl, { headers: session, redirect: "manual" });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /授权外部应用/);
  assert.match(html, /name="referrer" content="same-origin"/);
  assert.match(html, /读取全部攻略/);
  assert.match(html, /身份未经本站验证/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /name="intent"/);
  assert.doesNotMatch(html, /name="scope"/);
  if (client.client_secret) assert.ok(!html.includes(client.client_secret));
  const legacyOnly = await post("/api/oauth/consent", { intent, decision: "approve" }, { Origin: base, authorization: `Bearer ${process.env.HERMES_API_TOKEN}` });
  assert.equal(legacyOnly.status, 401);
  const badOrigin = await post("/api/oauth/consent", { intent, decision: "approve" }, { ...session, Origin: "https://evil.example.test" });
  assert.equal(badOrigin.status, 403);
  const accepted = await post("/api/oauth/consent", { intent, decision: "approve" }, { ...session, Origin: base });
  assert.equal(accepted.status, 303);
  const callback = new URL(accepted.headers.get("location"));
  assert.equal(callback.origin, new URL(callbackUri).origin);
  assert.equal(callback.searchParams.get("state"), "s".repeat(1144));
  assert.equal(callback.searchParams.get("iss"), base);
  const body = { grant_type: "authorization_code", client_id: client.client_id, code: callback.searchParams.get("code"), redirect_uri: callbackUri, code_verifier: verifier, resource };
  const headers = { Origin: geminiOrigin, ...(method === "client_secret_basic" ? { authorization: "Basic " + Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64") } : {}) };
  if (method === "client_secret_post") body.client_secret = client.client_secret;
  assert.equal((await post("/api/oauth/token", { ...body, resource: base + "/other" }, headers)).status, 400);
  if (method === "none") delete body.resource;
  body.scope = requestedScopes;
  const exchange = await post("/api/oauth/token", body, headers);
  assert.equal(exchange.status, 200);
  const token = await exchange.json();
  assert.match(token.access_token, /^tc_mcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(token.scope, requestedScopes);
  assert.ok(!("refresh_token" in token));
  assert.equal((await post("/api/oauth/token", body, headers)).status, 400);
  if (method === "none") {
    const retryAuthorization = await send("/api/oauth/authorize?" + query, { headers: session });
    const retryIntent = new URL(retryAuthorization.headers.get("location"), base).searchParams.get("intent");
    const retryConsent = await post("/api/oauth/consent", { intent: retryIntent, decision: "approve" }, { ...session, Origin: base });
    const retryCode = new URL(retryConsent.headers.get("location")).searchParams.get("code");
    assert.equal((await post("/api/oauth/token", { ...body, code: retryCode, code_verifier: "x".repeat(43) }, headers)).status, 400);
    assert.equal((await post("/api/oauth/token", { ...body, code: retryCode }, headers)).status, 400, "Bad PKCE consumes the code");
  }
  const mcpVersion = "2026-07-28";
  const mcpHeaders = { authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": mcpVersion, Origin: geminiOrigin };
  const mcpMeta = { "io.modelcontextprotocol/protocolVersion": mcpVersion, "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "fake-http-client", version: "1" } };
  let rpcId = 1;
  async function mcp(rpcMethod, params = {}) {
    const res = await send("/mcp", { method: "POST", headers: {
      ...mcpHeaders, "Mcp-Method": rpcMethod,
      ...(rpcMethod === "tools/call" ? { "Mcp-Name": params.name } : {}),
    }, body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: rpcMethod, params: { _meta: mcpMeta, ...params } }) });
    const body = await res.json();
    if (res.status === 200) {
      assert.equal(body.result.resultType, "complete");
      assert.equal(body.result._meta["io.modelcontextprotocol/serverInfo"].name, "travel-cards");
    }
    return { response: res, body };
  }
  // Discovery is optional; tools/list must work on the first request.
  assert.equal((await mcp("tools/list")).response.status, 200);
  const discovered = await mcp("server/discover");
  assert.equal(discovered.response.status, 200);
  assert.deepEqual(discovered.body.result.supportedVersions, [mcpVersion]);
  assert.deepEqual(discovered.body.result.capabilities, { tools: {} });
  assert.equal(discovered.body.result.cacheScope, "private");
  for (const removed of ["initialize", "ping"]) assert.equal((await mcp(removed)).response.status, 404);
  const legacyHeaders = { ...mcpHeaders };
  delete legacyHeaders["MCP-Protocol-Version"];
  async function standard(rpcMethod, params = {}, notification = false) {
    const response = await send("/mcp", { method: "POST", headers: legacyHeaders, body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: rpcId++ }), method: rpcMethod, params }) });
    return { response, body: response.status === 202 ? null : await response.json() };
  }
  const legacy = await standard("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "standard-client", version: "1" } });
  assert.equal(legacy.response.status, 200);
  assert.equal(legacy.body.result.protocolVersion, "2025-11-25");
  assert.deepEqual(legacy.body.result.capabilities, { tools: {} });
  assert.equal((await standard("notifications/initialized", {}, true)).response.status, 202);
  assert.deepEqual((await standard("ping")).body.result, {});
  assert.equal((await standard("tools/list")).body.result.tools.length, method === "none" ? 5 : 2);
  const unknownStandard = await standard("tools/call", { name: "delete_guide", arguments: {} });
  assert.equal(unknownStandard.response.status, 200);
  assert.equal(unknownStandard.body.error.code, -32602);
  assert.equal((await standard("tools/call", { name: "create_guide", arguments: {} }, true)).response.status, 400);
  const disallowedOrigin = await send("/mcp", { method: "POST", headers: { ...legacyHeaders, Origin: "https://evil.example.test" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "ping" }) });
  assert.equal(disallowedOrigin.status, 403);
  assert.equal(disallowedOrigin.headers.get("access-control-allow-origin"), null);
  const missingMcpMethod = await send("/mcp", { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list", params: { _meta: mcpMeta } }) });
  assert.equal(missingMcpMethod.status, 400);
  assert.equal((await missingMcpMethod.json()).error.code, -32020);
  for (const [nameHeader, status] of [["=?base64?bGlzdF9ndWlkZXM=?=", 200], ["%6Cist_guides", 400]]) {
    const response = await send("/mcp", { method: "POST", headers: { ...mcpHeaders, "Mcp-Method": "tools/call", "Mcp-Name": nameHeader }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { _meta: mcpMeta, name: "list_guides", arguments: {} } }) });
    assert.equal(response.status, status);
    const body = await response.json();
    if (status === 200) assert.equal(body.result.resultType, "complete"); else assert.equal(body.error.code, -32020);
  }
  const missingMeta = await mcp("tools/list", { _meta: {} });
  assert.equal(missingMeta.response.status, 400);
  assert.equal(missingMeta.body.error.code, -32602);
  const wrongHeader = await send("/mcp", { method: "POST", headers: { ...mcpHeaders, "Mcp-Method": "tools/call" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list", params: { _meta: mcpMeta } }) });
  assert.equal(wrongHeader.status, 400);
  assert.equal((await wrongHeader.json()).error.code, -32020);
  const oldVersion = "2025-11-25";
  const unsupported = await send("/mcp", { method: "POST", headers: { ...mcpHeaders, "MCP-Protocol-Version": oldVersion, "Mcp-Method": "server/discover" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "server/discover", params: { _meta: { ...mcpMeta, "io.modelcontextprotocol/protocolVersion": oldVersion } } }) });
  assert.equal(unsupported.status, 400);
  assert.deepEqual((await unsupported.json()).error.data, { supported: [mcpVersion], requested: oldVersion });
  for (const id of ["", "x".repeat(129)]) {
    const response = await send("/mcp", { method: "POST", headers: { ...mcpHeaders, "Mcp-Method": "server/discover", Accept: "Application/JSON" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "server/discover", params: { _meta: mcpMeta } }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).id, id);
  }
  const unacceptable = await send("/mcp", { method: "POST", headers: { ...mcpHeaders, Accept: "application/json;q=0, */*;q=1" }, body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }) });
  assert.equal(unacceptable.status, 406);
  const listed = await mcp("tools/list");
  assert.equal(listed.body.result.tools.length, method === "none" ? 5 : 2);
  assert.equal((await mcp("tools/call", { name: "delete_guide", arguments: {} })).body.error.code, -32602);
  if (method === "none") {
    const args = { title: "MCP HTTP synthetic", slug: "mcp-http-smoke", destination: "Fixture", excerpt: "Synthetic guide", days: 1, coverImage: { objectKey: "guides/smoke.png", publicUrl: "https://images.example.test/smoke.png", alt: "Synthetic" }, itinerary: [{ day: 1, title: "Day one", items: [{ place: "Fixture", description: "Synthetic" }] }], publish: true };
    const created = await mcp("tools/call", { name: "create_guide", arguments: args });
    assert.equal(created.body.result.isError, false);
    let guide = created.body.result.structuredContent.guide;
    assert.equal(guide.status, "published");
    assert.equal(guide.itinerary.length, 1);
    const bounded = await mcp("tools/call", { name: "list_guides", arguments: { q: "MCP HTTP synthetic", limit: 1 } });
    assert.equal(bounded.body.result.structuredContent.guides.length, 1);
    assert.equal(bounded.body.result.structuredContent.hasMore, false);
    const updated = await standard("tools/call", { name: "update_guide", arguments: { id: guide.id, expectedRevision: guide.revision, title: "Updated MCP synthetic", responseMode: "summary" } });
    guide = updated.body.result.structuredContent.guide;
    assert.equal(guide.revision, 2);
    assert.ok(!("itinerary" in guide));
    assert.deepEqual(JSON.parse(updated.body.result.content[0].text), updated.body.result.structuredContent);
    const conflict = await mcp("tools/call", { name: "update_guide", arguments: { id: guide.id, expectedRevision: 1, title: "Must not overwrite" } });
    assert.equal(conflict.response.status, 200);
    assert.equal(conflict.body.result.isError, true);
    assert.equal(conflict.body.result.structuredContent.error.code, "REVISION_CONFLICT");
    const standardConflict = await standard("tools/call", { name: "update_guide", arguments: { id: guide.id, expectedRevision: 1, title: "Must not overwrite" } });
    assert.equal(standardConflict.response.status, 200);
    assert.equal(standardConflict.body.result.structuredContent.error.status, 409);
    const read = await mcp("tools/call", { name: "get_guide", arguments: { id: guide.id } });
    assert.equal(read.body.result.structuredContent.guide.title, "Updated MCP synthetic");
    const cleanup = await send(`/api/guides/${guide.id}`, { method: "DELETE", headers: { authorization: `Bearer ${process.env.HERMES_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: guide.revision }) });
    assert.equal(cleanup.status, 204);
  } else {
    const deniedWrite = await mcp("tools/call", { name: "create_guide", arguments: {} });
    assert.equal(deniedWrite.response.status, 403);
    assert.match(deniedWrite.response.headers.get("www-authenticate") ?? "", /insufficient_scope/);
    assert.equal((await standard("tools/call", { name: "create_guide", arguments: {} })).response.status, 403);
  }
  const bypass = await send("/api/guides", { method: "POST", headers: { authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(bypass.status, 401);
  const list = await fetch(base + "/admin/oauth", { headers: session });
  assert.equal(list.status, 200);
  const listHtml = await list.text();
  assert.match(listHtml, /撤销访问/);
  assert.match(listHtml, /name="referrer" content="same-origin"/);
  assert.ok(!listHtml.includes(client.client_secret ?? "tc_oauth_secret_never-issued"));
  const revoked = await post("/api/oauth/revoke-client", { client_id: client.client_id }, { ...session, Origin: base });
  assert.equal(revoked.status, 303);
  assert.equal((await mcp("tools/list")).response.status, 401);
  assert.equal((await standard("tools/list")).response.status, 401);
  assert.equal((await send("/api/oauth/authorize?" + query, { headers: session })).status, 400);
}
console.log("oauth-mcp-http-smoke PASS modern+standard/CORS/preflight/metadata/login/consent/PKCE/replay/none+basic+post/optional-resource/scope/tools/publish/conflict/403/revoke/REST-denial; fake admin session, isolated local MongoDB only");
