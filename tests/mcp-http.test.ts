import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET, DELETE } from "@/app/mcp/route";
import { issueMcpAccessGrant, issueMcpOAuthAccessGrant } from "@/lib/mcp/access-grants";
import { authorizeMcpClient, registerMcpClient, revokeMcpClient } from "@/lib/mcp/oauth-clients";
const fakeAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: fakeAuth }));
const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const origin = "https://travel.example.test";
const admin = { authKind: "session" as const, actorLabel: "admin@example.test", user: { id: "admin", email: "admin@example.test" } };
const allScopes = ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload"];
const draft = { title: "MCP HTTP 杭州", slug: "mcp-http-hangzhou", destination: "杭州", excerpt: "西湖漫步", days: 1, coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" }, itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行" }] }] };
function ownedDb() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database access");
  return mongoose.connection.db;
}
async function grant(scopes = allScopes) {
  const c = await registerMcpClient({ redirect_uris: ["https://fake-client.example.test/callback"], token_endpoint_auth_method: "none", scope: scopes.join(" ") });
  await authorizeMcpClient(admin, c.client_id, scopes as Parameters<typeof authorizeMcpClient>[2]);
  return { clientId: c.client_id, ...await issueMcpOAuthAccessGrant(admin, { clientId: c.client_id, scopes }) };
}
function request(accessToken: string | null, message: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(origin + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extraHeaders }, body: JSON.stringify(message) });
}
function rpc(method: string, params: unknown = {}, id: string | number = 1) { return { jsonrpc: "2.0", id, method, params }; }
async function call(accessToken: string, name: string, args: unknown = {}) {
  const response = await POST(request(accessToken, rpc("tools/call", { name, arguments: args })));
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("HERMES_API_TOKEN", "legacy-token-at-least-16-characters");
  fakeAuth.mockResolvedValue({ user: admin.user });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fakeAuth.mockReset();
  if (!mongoose.connection.db) return;
  const db = ownedDb();
  for (const c of ["mcp_oauth_clients", "mcp_oauth_registration_windows", "mcp_access_grants"]) await db.collection(c).deleteMany({});
  await db.collection("guides").deleteMany({ slug: /^mcp-http-/ });
});
afterAll(async () => { await mongoose.disconnect(); global.mongooseConnection = undefined; });

describe("formal MCP HTTP (real isolated DB, fake approved OAuth clients)", () => {
  it("is closed by default and returns 401 discovery challenges before reading bodies", async () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    const req = request(null, rpc("tools/list"));
    expect((await POST(req)).status).toBe(404);
    expect(req.bodyUsed).toBe(false);
    expect((await GET(new Request(origin + "/mcp"))).status).toBe(404);
    vi.stubEnv("MCP_OAUTH_ENABLED", "true");
    for (const value of [null, "legacy-token-at-least-16-characters", "invalid-token"]) {
      const req = request(value, rpc("tools/call", { name: "create_guide", arguments: draft }), { Cookie: "authjs.session-token=fake-cookie" });
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(req.bodyUsed).toBe(false);
      expect(res.headers.get("www-authenticate")).toContain(origin + "/.well-known/oauth-protected-resource/mcp");
      expect(res.headers.get("www-authenticate")).toContain("guide.publish");
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
    expect(fakeAuth).not.toHaveBeenCalled();
  });

  it("rejects bare internal, cross-resource, revoked, expired and unapproved grants", async () => {
    const bare = await issueMcpAccessGrant(admin, { clientId: "bare-test-client", scopes: ["guide.read"] });
    expect((await POST(request(bare.accessToken, rpc("tools/list")))).status).toBe(401);
    const linked = await grant();
    await ownedDb().collection("mcp_access_grants").updateOne({ clientId: linked.clientId }, { $set: { resource: origin + "/api/mcp" } });
    expect((await POST(request(linked.accessToken, rpc("tools/list")))).status).toBe(401);
    const unapproved = await grant();
    await ownedDb().collection("mcp_oauth_clients").updateOne({ clientId: unapproved.clientId }, { $unset: { authorizedAt: "" } });
    expect((await POST(request(unapproved.accessToken, rpc("tools/list")))).status).toBe(401);
    const expired = await grant();
    await ownedDb().collection("mcp_access_grants").updateOne({ clientId: expired.clientId }, { $set: { expiresAt: new Date() } });
    expect((await POST(request(expired.accessToken, rpc("tools/list")))).status).toBe(401);
    const revoked = await grant();
    await revokeMcpClient(admin, revoked.clientId);
    expect((await POST(request(revoked.accessToken, rpc("tools/list")))).status).toBe(401);
  });

  it("negotiates versions, advertises six scoped tools and supports authenticated stateless lifecycle", async () => {
    const g = await grant();
    for (const version of ["2025-11-25", "2025-06-18", "2025-03-26", "2099-01-01"]) {
      const res = await POST(request(g.accessToken, rpc("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "fake-client", version: "1" } })));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.result.protocolVersion).toBe(version === "2099-01-01" ? "2025-11-25" : version);
      expect(body.result.capabilities).toEqual({ tools: {} });
      expect(res.headers.get("mcp-session-id")).toBeNull();
    }
    const initialized = await POST(request(g.accessToken, { jsonrpc: "2.0", method: "notifications/initialized" }));
    expect(initialized.status).toBe(202);
    expect(await initialized.text()).toBe("");
    expect(await (await POST(request(g.accessToken, rpc("ping")))).json()).toMatchObject({ id: 1, result: {} });
    const list = await (await POST(request(g.accessToken, rpc("tools/list")))).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_guides", "get_guide", "create_guide", "update_guide", "publish_guide", "upload_image"]);
    for (const handler of [GET, DELETE]) {
      const res = await handler(new Request(origin + "/mcp", { headers: { Authorization: `Bearer ${g.accessToken}` } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    }
  });

  it("echoes valid string request IDs, including empty and long IDs", async () => {
    const g = await grant();
    for (const id of ["", "x".repeat(129), 0]) {
      const response = await POST(request(g.accessToken, rpc("ping", {}, id)));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ jsonrpc: "2.0", id, result: {} });
      const error = await POST(request(g.accessToken, rpc("unknown-method", {}, id)));
      expect(await error.json()).toMatchObject({ id, error: { code: -32601 } });
    }
  });

  it("honors JSON Accept quality and specificity before any tool write", async () => {
    const g = await grant();
    for (const accept of ["application/json;q=0", "application/json;q=0, */*;q=1", "*/*;q=1, application/json;q=0", "application/*;q=0, */*;q=1", "application/json;q=2", "application/json;q=invalid", ""]) {
      const req = request(g.accessToken, rpc("tools/call", { name: "create_guide", arguments: draft }), { Accept: accept });
      expect((await POST(req)).status).toBe(406);
      expect(req.bodyUsed).toBe(false);
    }
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
    for (const accept of ["Application/JSON", "application/*", "application/json;q=0.1, */*;q=0", "application/json;q=1, application/*;q=0", "application/json;Q=0.5", "application/json;q=0.1, application/json;q=0.8"]) {
      expect((await POST(request(g.accessToken, rpc("ping"), { Accept: accept }))).status).toBe(200);
    }
  });

  it("serves private drafts, creates/updates/publishes via shared rules and preserves conflicts without automatic retries", async () => {
    const g = await grant();
    const created = await call(g.accessToken, "create_guide", draft);
    expect(created.body.result.isError).toBe(false);
    let guide = created.body.result.structuredContent.guide;
    const read = await call(g.accessToken, "get_guide", { id: guide.id });
    expect(read.body.result.structuredContent.guide.status).toBe("draft");
    const updated = await call(g.accessToken, "update_guide", { id: guide.id, expectedRevision: guide.revision, title: "MCP HTTP 更新" });
    guide = updated.body.result.structuredContent.guide;
    const conflict = await call(g.accessToken, "update_guide", { id: guide.id, expectedRevision: 1, title: "不应覆盖" });
    expect(conflict.response.status).toBe(200);
    expect(conflict.body.result).toMatchObject({ isError: true, structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } } });
    const published = await call(g.accessToken, "publish_guide", { id: guide.id, expectedRevision: guide.revision });
    expect(published.body.result.structuredContent.guide.status).toBe("published");
    expect(published.body.result.structuredContent.guide.title).toBe("MCP HTTP 更新");
    const direct = await call(g.accessToken, "create_guide", { ...draft, slug: "mcp-http-direct", publish: true });
    expect(direct.body.result.structuredContent.guide.status).toBe("published");
    const duplicate = await call(g.accessToken, "create_guide", { ...draft, publish: true });
    expect(duplicate.body.result).toMatchObject({ isError: true, structuredContent: { error: { status: 409, code: "SLUG_CONFLICT" } } });
  });

  it("filters read-only tools and returns minimal 403 step-up scopes, including create+publish", async () => {
    const readOnly = await grant(["guide.read"]);
    const tools = await (await POST(request(readOnly.accessToken, rpc("tools/list")))).json();
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_guides", "get_guide"]);
    const denied = await call(readOnly.accessToken, "create_guide", draft);
    expect(denied.response.status).toBe(403);
    expect(denied.response.headers.get("www-authenticate")).toContain('scope="guide.read guide.create"');
    const creator = await grant(["guide.read", "guide.create"]);
    const deniedPublish = await call(creator.accessToken, "create_guide", { ...draft, publish: true });
    expect(deniedPublish.response.status).toBe(403);
    expect(deniedPublish.response.headers.get("www-authenticate")).toContain('scope="guide.read guide.create guide.publish"');
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("distinguishes protocol errors from tool validation/business errors and prohibits delete/config/notification writes", async () => {
    const g = await grant();
    for (const method of ["delete_guide", "config/manage", "upload"]) {
      const res = await POST(request(g.accessToken, rpc(method, { role: "admin" })));
      expect((await res.json()).error.code).toBe(-32601);
    }
    for (const name of ["delete_guide", "unpublish_guide", "manage_config"]) expect((await call(g.accessToken, name, { id: "a".repeat(24) })).body.error).toMatchObject({ code: -32602, data: { code: "UNKNOWN_TOOL" } });
    const invalid = await call(g.accessToken, "create_guide", { ...draft, role: "admin" });
    expect(invalid.body.result).toMatchObject({ isError: true, structuredContent: { error: { code: "VALIDATION_ERROR", status: 400 } } });
    const missing = await call(g.accessToken, "get_guide", { id: "a".repeat(24) });
    expect(missing.body.result.isError).toBe(true);
    const notification = await POST(request(g.accessToken, { jsonrpc: "2.0", method: "tools/call", params: { name: "create_guide", arguments: draft } }));
    expect(notification.status).toBe(400);
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
    for (const body of [[rpc("ping")], { jsonrpc: "2.0", id: null, method: "ping" }, { ...rpc("ping"), role: "admin" }]) expect((await POST(request(g.accessToken, body))).status).toBe(400);
  });

  it("rejects forbidden Origins and unsupported headers and bounds actual bytes before dispatch", async () => {
    const g = await grant();
    for (const bad of ["null", "https://evil.example.test"]) expect((await POST(request(g.accessToken, rpc("ping"), { Origin: bad }))).status).toBe(403);
    expect((await POST(request(g.accessToken, rpc("ping"), { Origin: origin }))).status).toBe(200);
    expect((await POST(request(g.accessToken, rpc("ping"), { "MCP-Protocol-Version": "2099-01-01" }))).status).toBe(400);
    expect((await POST(request(g.accessToken, rpc("ping"), { Accept: "text/event-stream" }))).status).toBe(406);
    const headers = { Authorization: `Bearer ${g.accessToken}`, "Content-Type": "application/json" };
    const malformed = await POST(new Request(origin + "/mcp", { method: "POST", headers, body: "{" }));
    expect((await malformed.json()).error.code).toBe(-32700);
    const tooLarge = await POST(request(g.accessToken, { padding: "x".repeat(2 * 1024 * 1024) }));
    expect(tooLarge.status).toBe(413);
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });
});
