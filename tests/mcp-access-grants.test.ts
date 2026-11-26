import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/mcp/route";
import { assertAdminOrToken, type AdminActor } from "@/lib/admin";
import { assertCapability, type ApiActor } from "@/lib/capabilities";
import { authenticateMcpAccessToken, getMcpResource, issueMcpAccessGrant, issueMcpOAuthAccessGrant, revokeMcpAccessGrant } from "@/lib/mcp/access-grants";
import { guideToolScopes } from "@/lib/mcp/guide-tools";
import { authorizeMcpClient, registerMcpClient } from "@/lib/mcp/oauth-clients";

const fakeAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: fakeAuth }));

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const admin: AdminActor = { authKind: "session", actorLabel: "admin@example.test", user: { id: "admin", email: "admin@example.test" } };
const automation: AdminActor = { ...admin, authKind: "token", actorLabel: "api-token" };
const readOnly: ApiActor = { authKind: "restricted-ai", actorLabel: "other-client", scopes: ["guide.read"] };
const scopes = ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload", "attachment.upload"];
const draft = {
  title: "杭州一日游",
  slug: "mcp-grant-hangzhou",
  destination: "杭州",
  excerpt: "西湖漫步",
  days: 1,
  coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" },
  itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行游览" }] }],
};

function ownedDb() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database access");
  return mongoose.connection.db;
}

const origin = "https://travel.example.test";
const version = "2026-07-28";
const meta = { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} };

async function issue(grantedScopes = scopes) {
  return issueMcpAccessGrant(admin, { clientId: "fake-registered-client", scopes: grantedScopes });
}

async function oauthIssue(grantedScopes = scopes) {
  const client = await registerMcpClient({
    redirect_uris: ["https://fake-client.example.test/callback"],
    token_endpoint_auth_method: "none",
    scope: grantedScopes.join(" "),
  });
  await authorizeMcpClient(admin, client.client_id, grantedScopes as Parameters<typeof authorizeMcpClient>[2]);
  return issueMcpOAuthAccessGrant(admin, { clientId: client.client_id, scopes: grantedScopes });
}

async function mcpPost(accessToken: string, method: string, params: Record<string, unknown> = {}) {
  const response = await POST(new Request(origin + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
      "Mcp-Method": method,
      ...(method === "tools/call" && typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: meta, ...params } }),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

beforeEach(() => {
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("HERMES_API_TOKEN", "legacy-automation-test-token-12345");
  fakeAuth.mockResolvedValue({ user: admin.user });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fakeAuth.mockReset();
  if (!mongoose.connection.db) return;
  const db = ownedDb();
  for (const collection of ["mcp_oauth_clients", "mcp_oauth_registration_windows", "mcp_access_grants"]) {
    await db.collection(collection).deleteMany({});
  }
  await db.collection<{ _id: string }>("mcp_tool_rate_limits").deleteMany({ _id: /^mcp-grant:/ });
  await db.collection("guides").deleteMany({ slug: /^mcp-grant-/ });
});

afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("internal MCP access grant lifecycle (fake admin consent, isolated MongoDB)", () => {
  it("generates unique long-lived tokens and stores only a digest, with expiry and indexes", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => {});
    const grant = await issue();
    const second = await issue();
    expect(grant.accessToken).toMatch(/^tc_mcp_[A-Za-z0-9_-]{43}$/);
    expect(second.accessToken).not.toBe(grant.accessToken);
    expect(grant).toMatchObject({ resource: "https://travel.example.test/mcp", tokenType: "Bearer", expiresIn: 100 * 365 * 24 * 3600, scopes });
    const row = await ownedDb().collection("mcp_access_grants").findOne({ _id: new mongoose.Types.ObjectId(grant.grantId) });
    expect(row!.tokenHash).toBe(createHash("sha256").update(grant.accessToken).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(grant.accessToken);
    expect(new Date(row!.expiresAt).toISOString()).toBe(grant.expiresAt);
    expect(new Date(grant.expiresAt).getTime() - Date.now()).toBeGreaterThan(99 * 365 * 24 * 3600 * 1000);
    const indexes = await ownedDb().collection("mcp_access_grants").indexes();
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { tokenHash: 1 }, unique: true }),
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
    expect(JSON.stringify(audit.mock.calls)).not.toContain(grant.accessToken);
    const actor = await authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, grant.resource);
    expect(actor).toEqual({ authKind: "restricted-ai", actorLabel: `mcp-grant:${grant.grantId}`, scopes });
  });

  it.each([automation, readOnly])("denies signing and revocation to $authKind", async (actor) => {
    await expect(issueMcpAccessGrant(actor, { clientId: "fake-registered-client", scopes })).rejects.toMatchObject({ status: 403 });
    await expect(revokeMcpAccessGrant(actor, "a".repeat(24))).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    { scopes: [] },
    { scopes: ["guide.publish"] },
    { scopes: ["guide.read", "guide.read"] },
    { scopes: ["guide.read", "guide.delete"] },
    { scopes: ["guide.read", "config.manage"] },
    { scopes: ["guide.read", "assistant.use"] },
  ])("rejects invalid scopes %j", async (input) => {
    await expect(issueMcpAccessGrant(admin, { clientId: "fake-registered-client", ...input })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects self-reported roles, custom lifetime/resource and invalid client identifiers", async () => {
    for (const extra of [{ authKind: "session" }, { expiresIn: 86400 }, { resource: "https://other.test/mcp" }]) {
      await expect(issueMcpAccessGrant(admin, { clientId: "fake-registered-client", scopes, ...extra })).rejects.toMatchObject({ name: "ZodError" });
    }
    await expect(issueMcpAccessGrant(admin, { clientId: { $ne: null }, scopes })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects missing, malformed, legacy administrator and unknown tokens", async () => {
    const grant = await issue();
    for (const header of [null, "", "Basic test", "Bearer legacy-automation-test-token-12345", `Bearer tc_mcp_${"a".repeat(43)}`, `Bearer ${grant.accessToken} extra`]) {
      await expect(authenticateMcpAccessToken(header, grant.resource)).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    }
    expect(() => assertAdminOrToken(null, `Bearer ${grant.accessToken}`)).toThrow(expect.objectContaining({ status: 401 }));
    expect(assertAdminOrToken(null, "Bearer legacy-automation-test-token-12345").authKind).toBe("token");
  });

  it("binds tokens to the exact configured MCP resource, not probe, REST or another host", async () => {
    const grant = await issue();
    for (const resource of ["https://travel.example.test/api/mcp", "https://travel.example.test/api/mcp-probe", "https://travel.example.test/api/guides", `${grant.resource}/`, "https://other.test/mcp"]) {
      await expect(authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, resource)).rejects.toMatchObject({ status: 401 });
    }
    vi.stubEnv("AUTH_URL", "https://other.test");
    await expect(authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
  });

  it("requires HTTPS except for loopback development", () => {
    for (const origin of ["http://localhost:3100", "http://127.0.0.1:3100", "http://[::1]:3100"]) {
      vi.stubEnv("AUTH_URL", origin);
      expect(getMcpResource()).toBe(`${origin}/mcp`);
    }
    vi.stubEnv("AUTH_URL", "http://travel.example.test");
    expect(() => getMcpResource()).toThrow("HTTPS");
  });

  it("rejects expired tokens even when the database has not performed TTL cleanup", async () => {
    const grant = await issue();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(grant.expiresAt));
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({ _id: new mongoose.Types.ObjectId(grant.grantId) })).toBe(1);
    await expect(authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, grant.resource)).rejects.toMatchObject({ status: 401 });
  });

  it("rechecks persistent revocation, isolates other grants, and survives reconnection", async () => {
    const grant = await issue();
    const other = await issue();
    await authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, grant.resource);
    await revokeMcpAccessGrant(admin, grant.grantId);
    await revokeMcpAccessGrant(admin, grant.grantId);
    await mongoose.disconnect();
    global.mongooseConnection = undefined;
    await expect(authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, grant.resource)).rejects.toMatchObject({ status: 401 });
    await expect(authenticateMcpAccessToken(`Bearer ${other.accessToken}`, other.resource)).resolves.toMatchObject({ authKind: "restricted-ai" });
    await expect(revokeMcpAccessGrant(admin, "invalid-id")).rejects.toMatchObject({ name: "ZodError" });
  });

  it("enforces read-only scopes in discovery and invocation, not just role", async () => {
    const grant = await oauthIssue(["guide.read"]);
    const actor = await authenticateMcpAccessToken(`Bearer ${grant.accessToken}`, grant.resource);
    const list = await mcpPost(grant.accessToken, "tools/list");
    expect(list.response.status).toBe(200);
    expect(((list.body.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name)).toEqual(["list_guides", "get_guide"]);
    for (const [name, input] of [["create_guide", draft], ["update_guide", {}], ["publish_guide", {}]] as const) {
      expect(guideToolScopes(name, input)).toContain(`guide.${name.split("_")[0]}`);
      const res = await mcpPost(grant.accessToken, "tools/call", { name, arguments: input });
      expect(res.response.status).toBe(403);
      expect(res.response.headers.get("www-authenticate")).toContain(`scope="guide.read guide.${name.split("_")[0]}"`);
    }
    expect(await ownedDb().collection("guides").countDocuments({ slug: draft.slug })).toBe(0);
    for (const capability of ["guide.create", "guide.update", "guide.publish", "guide.delete", "guide.unpublish", "image.upload", "attachment.upload", "assistant.use", "config.manage"] as const) {
      expect(() => assertCapability(actor, capability)).toThrow(expect.objectContaining({ status: 403 }));
    }
  });

  it("requires publish scope for credential-backed direct publication", async () => {
    const limited = await oauthIssue(["guide.read", "guide.create"]);
    for (const publication of [{ publish: true }, { status: "published" }]) {
      const res = await mcpPost(limited.accessToken, "tools/call", { name: "create_guide", arguments: { ...draft, ...publication } });
      expect(res.response.status).toBe(403);
      expect(res.response.headers.get("www-authenticate")).toContain("guide.publish");
    }
    expect(await ownedDb().collection("guides").countDocuments({ slug: draft.slug })).toBe(0);

    const full = await oauthIssue();
    const created = await mcpPost(full.accessToken, "tools/call", { name: "create_guide", arguments: { ...draft, publish: true } });
    expect(created.response.status).toBe(200);
    expect((created.body.result as { structuredContent: { guide: unknown } }).structuredContent.guide).toMatchObject({ revision: 1, status: "published" });
  });
});
