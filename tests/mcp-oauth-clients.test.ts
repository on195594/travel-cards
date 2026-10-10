import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/oauth/register/route";
import { connectDb } from "@/lib/db";
import * as clients from "@/lib/mcp/oauth-clients";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const endpoint = "https://travel.example.test/api/oauth/register";
const metadata = {
  client_name: "Fake unverified client",
  redirect_uris: ["https://client.example.test/callback?return=%2Fguides"],
  scope: "guide.read guide.create guide.update guide.publish",
};
function ownedDb() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database access");
  return mongoose.connection.db;
}
function request(input: unknown = metadata) {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}
async function clearRegistrations() {
  if (!mongoose.connection.db) return;
  const db = ownedDb();
  await db.collection("mcp_oauth_clients").deleteMany({});
  await db.collection("mcp_oauth_registration_windows").deleteMany({});
}

beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_ENABLED", "true");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await clearRegistrations();
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("MCP OAuth DCR (fake clients, isolated MongoDB, no consent or tokens)", () => {
  it.each([undefined, "false", "TRUE", "1"])("stays closed without the exact opt-in (%s), before body or DB access", async (flag) => {
    if (flag === undefined) delete process.env.MCP_OAUTH_ENABLED;
    else vi.stubEnv("MCP_OAUTH_ENABLED", flag);
    const quota = vi.spyOn(clients, "takeMcpRegistrationQuota");
    const req = request();
    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(req.bodyUsed).toBe(false);
    expect(quota).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it.each([undefined, "none", "client_secret_basic", "client_secret_post"])("registers %s clients without granting access; secrets are returned once and only hashed in storage", async (method) => {
    const logs = vi.spyOn(console, "info").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request({ ...metadata, token_endpoint_auth_method: method, client_secret: "client-supplied-secret", client_uri: "https://untrusted.example.test/" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("pragma")).toBe("no-cache");
    const body = await res.json();
    expect(body).toMatchObject({ ...metadata, token_endpoint_auth_method: method ?? "client_secret_basic", grant_types: ["authorization_code"], response_types: ["code"] });
    expect(body.client_id).toMatch(/^tc_oauth_[A-Za-z0-9_-]{43}$/);
    expect(body).not.toHaveProperty("access_token");
    expect(body).not.toHaveProperty("registration_access_token");
    expect(body).not.toHaveProperty("client_uri");
    const row = await clients.findRegisteredMcpClient(body.client_id);
    expect(row).toMatchObject({ clientId: body.client_id, clientName: metadata.client_name, redirectUris: metadata.redirect_uris, scopes: metadata.scope.split(" ") });
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(body.client_id_issued_at).toBe(Math.floor(row!.createdAt.getTime() / 1000));
    if (method === "none") {
      expect(body).not.toHaveProperty("client_secret");
      expect(body).not.toHaveProperty("client_secret_expires_at");
      expect(row).not.toHaveProperty("secretHash");
    } else {
      expect(body.client_secret).toMatch(/^tc_oauth_secret_[A-Za-z0-9_-]{43}$/);
      expect(body.client_secret_expires_at).toBe(Math.floor(row!.expiresAt.getTime() / 1000));
      expect(row!.secretHash).toBe(createHash("sha256").update(body.client_secret).digest("hex"));
      expect(JSON.stringify(row)).not.toContain(body.client_secret);
      expect(JSON.stringify([...logs.mock.calls, ...errors.mock.calls])).not.toContain(body.client_secret);
    }
    expect(JSON.stringify(row)).not.toContain("client-supplied-secret");
    const second = await (await POST(request({ redirect_uris: metadata.redirect_uris }))).json();
    expect(second.client_id).not.toBe(body.client_id);
    expect(second.scope).toBe("guide.read");
    if (body.client_secret) expect(second.client_secret).not.toBe(body.client_secret);
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({})).toBe(0);
    expect(await ownedDb().collection("mcp_oauth_clients").indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { clientId: 1 }, unique: true }),
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
  });

  it.each([
    "http://client.example.test/callback", "https:///client.example.test/callback", "https://user:password@client.example.test/callback",
    "https://client.example.test/callback#fragment", "https://client.example.test/callback#",
    "https://*.example.test/callback", " https://client.example.test/callback",
    "https://client.example.test/back\\slash", "not-a-url", "https://client.example.test/with space",
  ])("rejects unsafe redirect URI %s with a DCR error before storage", async (uri) => {
    const res = await POST(request({ ...metadata, redirect_uris: [uri] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_redirect_uri" });
    expect(await ownedDb().collection("mcp_oauth_clients").countDocuments({})).toBe(0);
  });

  it.each([
    { redirect_uris: [] }, { redirect_uris: [metadata.redirect_uris[0], metadata.redirect_uris[0]] },
    { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://client.example.test/${i}`) },
    { token_endpoint_auth_method: "private_key_jwt" }, { grant_types: ["refresh_token"] },
    { grant_types: ["authorization_code", "refresh_token"] }, { response_types: ["token"] },
    { scope: "guide.delete" }, { scope: "guide.read guide.delete" }, { scope: "guide.create" },
    { scope: "guide.read guide.read" }, { scope: "guide.read  guide.create" }, { scope: "guide.read\tguide.create" },
    { scope: "" }, { client_name: "x".repeat(129) }, { client_name: " " },
  ])("rejects unsupported or unbounded metadata %j", async (override) => {
    const res = await POST(request({ ...metadata, ...override }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(override.redirect_uris ? "invalid_redirect_uri" : "invalid_client_metadata");
    expect(await ownedDb().collection("mcp_oauth_clients").countDocuments({})).toBe(0);
  });

  it("explicitly rejects expired and revoked clients even before TTL cleanup, and validates lookup input", async () => {
    const body = await (await POST(request())).json();
    const collection = ownedDb().collection("mcp_oauth_clients");
    const now = new Date();
    await collection.updateOne({ clientId: body.client_id }, { $set: { expiresAt: now } });
    expect(await clients.findRegisteredMcpClient(body.client_id)).toBeNull();
    const second = await (await POST(request())).json();
    await collection.updateOne({ clientId: second.client_id }, { $set: { revokedAt: now } });
    expect(await clients.findRegisteredMcpClient(second.client_id)).toBeNull();
    expect(await clients.findRegisteredMcpClient({ $ne: null })).toBeNull();
    expect(await clients.findRegisteredMcpClient("unregistered-client")).toBeNull();
  });

  it("caps actual streamed bytes and declared size, rejects malformed JSON/content type, and counts rejected attempts", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.now());
    const large = new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ padding: "中".repeat(clients.MCP_REGISTRATION_MAX_BYTES) }) });
    expect((await POST(large)).status).toBe(413);
    const declared = new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": String(clients.MCP_REGISTRATION_MAX_BYTES + 1) }, body: "{}" });
    expect((await POST(declared)).status).toBe(413);
    expect(declared.bodyUsed).toBe(false);
    for (const [body, contentType, status] of [["{", "application/json", 400], ["{}", "text/plain", 415], ["[]", "application/json", 400]] as const) {
      const res = await POST(new Request(endpoint, { method: "POST", headers: { "Content-Type": contentType }, body }));
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ error: "invalid_client_metadata" });
    }
    const hour = String(Math.floor(Date.now() / 3_600_000));
    expect(await ownedDb().collection<{ _id: string; used: number }>("mcp_oauth_registration_windows").findOne({ _id: hour })).toMatchObject({ used: 5 });
    expect(await ownedDb().collection("mcp_oauth_clients").countDocuments({})).toBe(0);
  });

  it("enforces the global hourly quota atomically across concurrent attempts, ignoring proxy headers", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    await connectDb();
    await clients.takeMcpRegistrationQuota();
    const hour = String(Math.floor(Date.now() / 3_600_000));
    const collection = ownedDb().collection<{ _id: string; used: number; expiresAt: Date }>("mcp_oauth_registration_windows");
    await collection.updateOne({ _id: hour }, { $set: { used: clients.MCP_REGISTRATION_LIMIT - 1 } });
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => {
      const req = request();
      req.headers.set("X-Forwarded-For", `192.0.2.${i}`);
      return POST(req);
    }));
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(9);
    for (const res of responses.filter((res) => res.status === 429)) {
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(Number(res.headers.get("retry-after"))).toBeLessThanOrEqual(3600);
      expect(await res.json()).toEqual({ error: "rate_limit_exceeded" });
    }
    expect(await ownedDb().collection("mcp_oauth_clients").countDocuments({})).toBe(1);
    expect(await collection.indexes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    ]));
    await clearRegistrations();
    const firstWindow = await Promise.all(Array.from({ length: 10 }, () => clients.takeMcpRegistrationQuota()));
    expect(firstWindow.every((result) => result.allowed)).toBe(true);
    expect(await collection.countDocuments({})).toBe(1);
    expect(await collection.findOne({ _id: hour })).toMatchObject({ used: 10 });
    clock.mockReturnValue(now + 3_600_000);
    expect((await clients.takeMcpRegistrationQuota()).allowed).toBe(true);
    expect(await collection.countDocuments({})).toBe(2);
  });

  it("fails closed on database errors without echoing errors or submitted credentials", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(clients, "takeMcpRegistrationQuota").mockRejectedValue(new Error("private-connection-secret"));
    const res = await POST(request({ ...metadata, client_secret: "private-submitted-secret" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-");
  });
});
