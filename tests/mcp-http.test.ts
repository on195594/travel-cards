import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET, DELETE, OPTIONS } from "@/app/mcp/route";
import { issueMcpAccessGrant, issueMcpOAuthAccessGrant } from "@/lib/mcp/access-grants";
import { authorizeMcpClient, registerMcpClient, revokeMcpClient } from "@/lib/mcp/oauth-clients";
import { consumeMcpToolCall, MCP_TOOL_CALLS_PER_MINUTE } from "@/lib/mcp/rate-limit";

const fakeAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: fakeAuth }));

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");

const origin = "https://travel.example.test";
const admin = { authKind: "session" as const, actorLabel: "admin@example.test", user: { id: "admin", email: "admin@example.test" } };
const allScopes = ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload", "attachment.upload"];
const draft = {
  title: "MCP HTTP 杭州",
  slug: "mcp-http-hangzhou",
  destination: "杭州",
  excerpt: "西湖漫步",
  days: 1,
  coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" },
  itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行" }] }],
};

function ownedDb() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) {
    throw new Error("Refusing non-test database access");
  }
  return mongoose.connection.db;
}

async function grant(scopes = allScopes) {
  const c = await registerMcpClient({
    redirect_uris: ["https://fake-client.example.test/callback"],
    token_endpoint_auth_method: "none",
    scope: scopes.join(" "),
  });
  await authorizeMcpClient(admin, c.client_id, scopes as Parameters<typeof authorizeMcpClient>[2]);
  return { clientId: c.client_id, ...await issueMcpOAuthAccessGrant(admin, { clientId: c.client_id, scopes }) };
}

const version = "2026-07-28";
const meta = { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} };

function request(accessToken: string | null, message: unknown, extraHeaders: Record<string, string> = {}) {
  const body = message as { method?: string; params?: { name?: string } };
  return new Request(origin + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
      "Mcp-Method": body.method ?? "server/discover",
      ...(body.method === "tools/call" && typeof body.params?.name === "string" ? { "Mcp-Name": body.params.name } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(message),
  });
}

function rpc(method: string, params: Record<string, unknown> = {}, id: string | number = 1) {
  return { jsonrpc: "2.0", id, method, params: { _meta: meta, ...params } };
}

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
  for (const c of ["mcp_oauth_clients", "mcp_oauth_registration_windows", "mcp_access_grants"]) {
    await db.collection(c).deleteMany({});
  }
  await db.collection("guides").deleteMany({ slug: /^mcp-http-/ });
  await db.collection<{ _id: string }>("mcp_tool_rate_limits").deleteMany({ _id: /^mcp-grant:/ });
});

afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("formal MCP HTTP via official SDK (real isolated DB, fake approved OAuth clients)", () => {
  it("keeps CORS and readable error headers for modern failures, rate limits, and rejected legacy handshakes", async () => {
    const gemini = "https://gemini.google.com";
    async function postGemini(req: Request) {
      const response = await POST(req);
      expect(response.headers.get("access-control-allow-origin")).toBe(gemini);
      expect(response.headers.get("vary")).toContain("Origin");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
      expect(response.headers.get("access-control-expose-headers")).toContain("Retry-After");
      return response;
    }

    const reader = await grant(["guide.read"]);
    const denied = await postGemini(request(reader.accessToken, rpc("tools/call", { name: "create_guide", arguments: draft }), { Origin: gemini }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain('scope="guide.read guide.create"');

    const unknown = await postGemini(request(reader.accessToken, rpc("tools/call", { name: "unknown_tool", arguments: {} }), { Origin: gemini }));
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).error.code).toBe(-32602);

    const legacyInit = request(reader.accessToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {} },
    }, { Origin: gemini });
    legacyInit.headers.delete("MCP-Protocol-Version");
    legacyInit.headers.delete("Mcp-Method");
    const legacyRejected = await postGemini(legacyInit);
    expect(legacyRejected.status).toBe(400);
    expect((await legacyRejected.json()).error.code).toBe(-32022);

    const writer = await grant();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const label = `mcp-grant:${writer.grantId}`;
    await consumeMcpToolCall(label);
    const counters = ownedDb().collection<{ _id: string; count: number }>("mcp_tool_rate_limits");
    await counters.updateOne({ _id: `${label}:${Math.floor(now / 60_000)}` }, { $set: { count: MCP_TOOL_CALLS_PER_MINUTE } });

    const limited = await postGemini(request(writer.accessToken, rpc("tools/call", { name: "create_guide", arguments: draft }), { Origin: gemini }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).error.code).toBe(429);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mongoose.models.McpToolRateLimit, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("fake counter failure");
    });
    const unavailable = await postGemini(request(writer.accessToken, rpc("tools/call", { name: "create_guide", arguments: draft }), { Origin: gemini }));
    expect(unavailable.status).toBe(500);
    expect((await unavailable.json()).error.code).toBe(-32603);
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("is closed by default and returns 401 discovery challenges before reading bodies", async () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    const closedReq = request(null, rpc("tools/list"));
    expect((await POST(closedReq)).status).toBe(404);
    expect(closedReq.bodyUsed).toBe(false);
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

  it("discovers 2026 capabilities without initialization, disables SSE subscriptions, and lists seven scoped tools", async () => {
    const g = await grant();
    // Calls work before discovery; no connection state or prior capabilities are required.
    const list = await (await POST(request(g.accessToken, rpc("tools/list")))).json();
    expect(list.result).toMatchObject({ resultType: "complete", ttlMs: 0, cacheScope: "private" });
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "list_guides", "get_guide", "create_guide", "update_guide", "publish_guide", "upload_image", "upload_attachment",
    ]);

    const res = await POST(request(g.accessToken, rpc("server/discover")));
    expect(res.status).toBe(200);
    expect((await res.json()).result).toMatchObject({
      resultType: "complete",
      supportedVersions: [version],
      capabilities: { tools: { listChanged: false } },
      ttlMs: 0,
      cacheScope: "private",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "travel-cards", version: "2.0.0" } },
    });
    expect(res.headers.get("mcp-session-id")).toBeNull();

    const listen = await POST(request(g.accessToken, rpc("subscriptions/listen", { notifications: { toolsListChanged: true } })));
    expect(listen.status).toBe(404);
    expect(listen.headers.get("content-type")).toContain("application/json");
    expect((await listen.json()).error.code).toBe(-32601);

    for (const handler of [GET, DELETE]) {
      const unsupported = await handler(new Request(origin + "/mcp", { headers: { Authorization: `Bearer ${g.accessToken}` } }));
      expect(unsupported.status).toBe(405);
      expect(unsupported.headers.get("allow")).toBe("POST");
    }
  });

  it("echoes valid request IDs and uses null ID when no single request ID is determinable", async () => {
    const g = await grant();
    for (const id of ["", "x".repeat(129), 0]) {
      const response = await POST(request(g.accessToken, rpc("server/discover", {}, id)));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id, result: { resultType: "complete" } });
      const error = await POST(request(g.accessToken, rpc("unknown-method", {}, id)));
      expect(error.status).toBe(404);
      expect(await error.json()).toMatchObject({ id, error: { code: -32601 } });
    }
    const malformed = await POST(request(g.accessToken, { jsonrpc: "2.0", id: null, method: "server/discover" }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).id).toBeNull();
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
      expect((await POST(request(g.accessToken, rpc("server/discover"), { Accept: accept }))).status).toBe(200);
    }
  });

  it("rejects missing per-request metadata and enforces required modern header bindings", async () => {
    const g = await grant();
    for (const _meta of [
      {},
      { ...meta, "io.modelcontextprotocol/protocolVersion": undefined },
      { ...meta, "io.modelcontextprotocol/clientCapabilities": undefined },
      { ...meta, "io.modelcontextprotocol/clientCapabilities": [] },
    ]) {
      const res = await POST(request(g.accessToken, rpc("tools/list", { _meta })));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(-32602);
    }

    for (const header of ["MCP-Protocol-Version", "Mcp-Method", "Mcp-Name"]) {
      for (const value of [undefined, "mismatch"]) {
        const req = request(g.accessToken, rpc("tools/call", { name: "create_guide", arguments: draft }));
        if (value === undefined) req.headers.delete(header);
        else req.headers.set(header, value);
        const res = await POST(req);
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe(-32020);
      }
    }

    const encoded = await POST(request(g.accessToken, rpc("tools/call", { name: "list_guides" }), { "Mcp-Name": "=?base64?bGlzdF9ndWlkZXM=?=" }));
    expect(encoded.status).toBe(200);
    expect((await encoded.json()).result.isError).not.toBe(true);

    for (const badName of ["%6Cist_guides", "=?base64?%%%%?=", "=?BASE64?bGlzdF9ndWlkZXM=?="]) {
      const res = await POST(request(g.accessToken, rpc("tools/call", { name: "list_guides" }), { "Mcp-Name": badName }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe(-32020);
    }
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("strictly rejects legacy handshakes, unsupported versions, and drops notifications without writes", async () => {
    const g = await grant();
    const legacyRequests: Request[] = [];

    const init = request(g.accessToken, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {} } });
    init.headers.delete("MCP-Protocol-Version");
    init.headers.delete("Mcp-Method");
    legacyRequests.push(init);

    const ping = request(g.accessToken, { jsonrpc: "2.0", id: 2, method: "ping", params: {} });
    ping.headers.delete("MCP-Protocol-Version");
    ping.headers.delete("Mcp-Method");
    legacyRequests.push(ping);

    const legacyList = request(g.accessToken, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
    legacyList.headers.delete("MCP-Protocol-Version");
    legacyList.headers.delete("Mcp-Method");
    legacyRequests.push(legacyList);

    const legacyWrite = request(g.accessToken, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_guide", arguments: draft } });
    legacyWrite.headers.delete("MCP-Protocol-Version");
    legacyWrite.headers.delete("Mcp-Method");
    legacyWrite.headers.delete("Mcp-Name");
    legacyRequests.push(legacyWrite);

    const stdVerCall = request(g.accessToken, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_guide", arguments: draft } }, { "MCP-Protocol-Version": "2025-11-25" });
    stdVerCall.headers.delete("Mcp-Method");
    stdVerCall.headers.delete("Mcp-Name");
    legacyRequests.push(stdVerCall);

    for (const req of legacyRequests) {
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: -32022, data: { supported: [version] } });
    }

    for (const requested of ["2025-11-25", "2099-01-01"]) {
      const params = { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": requested } };
      const res = await POST(request(g.accessToken, rpc("server/discover", params), { "MCP-Protocol-Version": requested }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: -32022, data: { supported: [version], requested } });
    }

    for (const method of ["initialize", "ping", "unknown-method"]) {
      const unknown = await POST(request(g.accessToken, rpc(method)));
      expect(unknown.status).toBe(404);
      expect((await unknown.json()).error.code).toBe(-32601);
    }

    const legacyNotif = request(g.accessToken, { jsonrpc: "2.0", method: "notifications/initialized" });
    legacyNotif.headers.delete("MCP-Protocol-Version");
    legacyNotif.headers.delete("Mcp-Method");
    expect((await POST(legacyNotif)).status).toBe(202);

    const modernNotifWrite = request(g.accessToken, { jsonrpc: "2.0", method: "tools/call", params: { _meta: meta, name: "create_guide", arguments: draft } });
    expect((await POST(modernNotifWrite)).status).toBe(202);

    const legacyNotifWrite = request(g.accessToken, { jsonrpc: "2.0", method: "tools/call", params: { name: "create_guide", arguments: draft } });
    legacyNotifWrite.headers.delete("MCP-Protocol-Version");
    legacyNotifWrite.headers.delete("Mcp-Method");
    legacyNotifWrite.headers.delete("Mcp-Name");
    expect((await POST(legacyNotifWrite)).status).toBe(202);

    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("returns 429 with Retry-After without writing, while preserving discovery and other grants", async () => {
    const g = await grant();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const label = `mcp-grant:${g.grantId}`;
    await consumeMcpToolCall(label);
    const db = ownedDb().collection<{ _id: string; count: number }>("mcp_tool_rate_limits");
    const seeded = await db.updateOne({ _id: `${label}:${Math.floor(now / 60_000)}` }, { $set: { count: MCP_TOOL_CALLS_PER_MINUTE } });
    expect(seeded.matchedCount).toBe(1);

    const limited = await call(g.accessToken, "create_guide", draft);
    expect(limited.response.status).toBe(429);
    expect(Number(limited.response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(limited.body.error.code).toBe(429);
    expect((await POST(request(g.accessToken, rpc("server/discover")))).status).toBe(200);

    const other = await grant();
    expect((await call(other.accessToken, "list_guides")).response.status).toBe(200);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(mongoose.models.McpToolRateLimit, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("fake counter storage failure");
    });
    const unavailable = await call(other.accessToken, "create_guide", draft);
    expect(unavailable.response.status).toBe(500);
    expect(unavailable.body).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
    expect(unavailable.body).not.toHaveProperty("result");
    expect(console.error).toHaveBeenLastCalledWith("MCP rate limit failed", "Error");
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("serves private drafts, creates/updates/publishes via shared rules and preserves conflicts without automatic retries", async () => {
    const g = await grant();
    const created = await call(g.accessToken, "create_guide", draft);
    expect(created.body.result.isError).not.toBe(true);
    let guide = created.body.result.structuredContent.guide;

    const read = await call(g.accessToken, "get_guide", { id: guide.id });
    expect(read.body.result.structuredContent.guide.status).toBe("draft");

    const updated = await call(g.accessToken, "update_guide", { id: guide.id, expectedRevision: guide.revision, title: "MCP HTTP 更新" });
    guide = updated.body.result.structuredContent.guide;

    const conflict = await call(g.accessToken, "update_guide", { id: guide.id, expectedRevision: 1, title: "不应覆盖" });
    expect(conflict.response.status).toBe(200);
    expect(conflict.body.result).toMatchObject({
      resultType: "complete",
      isError: true,
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "travel-cards" } },
      structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } },
    });

    const published = await call(g.accessToken, "publish_guide", { id: guide.id, expectedRevision: guide.revision });
    expect(published.body.result.structuredContent.guide.status).toBe("published");
    expect(published.body.result.structuredContent.guide.title).toBe("MCP HTTP 更新");

    const direct = await call(g.accessToken, "create_guide", { ...draft, slug: "mcp-http-direct", publish: true });
    expect(direct.body.result.structuredContent.guide.status).toBe("published");

    const duplicate = await call(g.accessToken, "create_guide", { ...draft, publish: true });
    expect(duplicate.body.result).toMatchObject({ isError: true, structuredContent: { error: { status: 409, code: "SLUG_CONFLICT" } } });
  });

  it("filters read-only tools and returns minimal 403 step-up scopes, including compound write scopes", async () => {
    const readOnly = await grant(["guide.read"]);
    const tools = await (await POST(request(readOnly.accessToken, rpc("tools/list")))).json();
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_guides", "get_guide"]);

    const denied = await call(readOnly.accessToken, "create_guide", draft);
    expect(denied.response.status).toBe(403);
    expect(denied.response.headers.get("www-authenticate")).toContain('scope="guide.read guide.create"');

    const selfDeclaredAdmin = await POST(request(readOnly.accessToken, rpc("tools/call", {
      name: "create_guide",
      arguments: draft,
      _meta: { ...meta, "io.modelcontextprotocol/clientInfo": { name: "admin", version: "1" }, "io.modelcontextprotocol/clientCapabilities": { admin: true, scopes: allScopes } },
    })));
    expect(selfDeclaredAdmin.status).toBe(403);

    const creator = await grant(["guide.read", "guide.create"]);
    const deniedPublish = await call(creator.accessToken, "create_guide", { ...draft, publish: true });
    expect(deniedPublish.response.status).toBe(403);
    expect(deniedPublish.response.headers.get("www-authenticate")).toContain('scope="guide.read guide.create guide.publish"');

    const uploader = await grant(["guide.read", "image.upload", "attachment.upload"]);
    const deniedCoverUpdate = await call(uploader.accessToken, "upload_image", {
      url: "https://images.example.test/pic.png",
      alt: "封面",
      guideId: "a".repeat(24),
      expectedRevision: 1,
    });
    expect(deniedCoverUpdate.response.status).toBe(403);
    expect(deniedCoverUpdate.response.headers.get("www-authenticate")).toContain('scope="guide.read image.upload guide.update"');

    const deniedAttachUpdate = await call(uploader.accessToken, "upload_attachment", {
      name: "route.gpx",
      type: "gpx",
      content: "<gpx></gpx>",
      guideId: "a".repeat(24),
      expectedRevision: 1,
    });
    expect(deniedAttachUpdate.response.status).toBe(403);
    expect(deniedAttachUpdate.response.headers.get("www-authenticate")).toContain('scope="guide.read attachment.upload guide.update"');

    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });

  it("distinguishes protocol errors from tool validation/business errors and prohibits delete/config writes", async () => {
    const g = await grant();
    for (const method of ["delete_guide", "config/manage", "upload"]) {
      const res = await POST(request(g.accessToken, rpc(method, { role: "admin" })));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe(-32601);
    }

    for (const name of ["delete_guide", "unpublish_guide", "manage_config"]) {
      const res = await call(g.accessToken, name, { id: "a".repeat(24) });
      expect(res.response.status).toBe(200);
      expect(res.body.error.code).toBe(-32602);
    }

    const invalid = await call(g.accessToken, "create_guide", { ...draft, role: "admin" });
    expect(invalid.response.status).toBe(200);
    expect(invalid.body.result.isError).toBe(true);
    expect(invalid.body.result.content[0].text).toContain("Input validation error");

    const missing = await call(g.accessToken, "get_guide", { id: "a".repeat(24) });
    expect(missing.body.result).toMatchObject({ isError: true, structuredContent: { error: { status: 404, code: "NOT_FOUND" } } });

    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
    for (const body of [[rpc("server/discover")], { ...rpc("server/discover"), role: "admin" }]) {
      expect((await POST(request(g.accessToken, body))).status).toBe(400);
    }
  });

  it("rejects forbidden Origins and unsupported headers and bounds actual bytes before dispatch", async () => {
    const g = await grant();
    for (const bad of ["null", "https://evil.example.test"]) {
      const denied = await POST(request(g.accessToken, rpc("server/discover"), { Origin: bad }));
      expect(denied.status).toBe(403);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect((await POST(request(g.accessToken, rpc("server/discover"), { Origin: origin }))).status).toBe(200);
    const geminiRes = await POST(request(g.accessToken, rpc("server/discover"), { Origin: "https://gemini.google.com" }));
    expect(geminiRes.status).toBe(200);
    expect(geminiRes.headers.get("access-control-allow-origin")).toBe("https://gemini.google.com");

    const optionsRes = await OPTIONS(new Request(origin + "/mcp", { method: "OPTIONS", headers: { Origin: "https://gemini.google.com" } }));
    expect(optionsRes.status).toBe(204);
    expect(optionsRes.headers.get("access-control-allow-origin")).toBe("https://gemini.google.com");

    expect((await POST(request(g.accessToken, rpc("server/discover"), { "MCP-Protocol-Version": "2099-01-01" }))).status).toBe(400);
    expect((await POST(request(g.accessToken, rpc("server/discover"), { Accept: "text/event-stream" }))).status).toBe(406);

    const headers = { Authorization: `Bearer ${g.accessToken}`, "Content-Type": "application/json" };
    const malformed = await POST(new Request(origin + "/mcp", { method: "POST", headers, body: "{" }));
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe(-32700);

    const tooLarge = await POST(request(g.accessToken, { padding: "x".repeat(2 * 1024 * 1024) }));
    expect(tooLarge.status).toBe(413);
    expect(await ownedDb().collection("guides").countDocuments({ slug: /^mcp-http-/ })).toBe(0);
  });
});
