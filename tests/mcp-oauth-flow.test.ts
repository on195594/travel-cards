import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdminOrToken } from "@/lib/admin";
import { assertCapability, type ApiCapability } from "@/lib/capabilities";
import { getLoginReturnTo } from "@/lib/login-return";
import { authenticateMcpOAuthAccessToken, getMcpResource, issueMcpAccessGrant } from "@/lib/mcp/access-grants";
import { getConsentIntent } from "@/lib/mcp/oauth-authorizations";
import { listMcpClientAuthorizations } from "@/lib/mcp/oauth-clients";
import { POST as register } from "@/app/api/oauth/register/route";
import { GET as authorize } from "@/app/api/oauth/authorize/route";
import { POST as consent } from "@/app/api/oauth/consent/route";
import { POST as token } from "@/app/api/oauth/token/route";
import { POST as revoke } from "@/app/api/oauth/revoke-client/route";
import { GET as serverMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/mcp/route";
import { POST as createGuide } from "@/app/api/guides/route";

const fakeAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({
  auth: fakeAuth,
  requireCapability: async (request: Request, capability: ApiCapability) => {
    const actor = assertAdminOrToken(await fakeAuth(), request.headers.get("authorization"));
    assertCapability(actor, capability);
    return actor;
  },
}));
const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const origin = "https://travel.example.test";
const redirectUri = "https://fake-client.example.test/callback?source=fixture";
const session = { user: { id: "admin", email: "admin@example.test" } };
const admin = { ...session, authKind: "session" as const, actorLabel: session.user.email };
const scopes = "guide.read guide.create guide.update guide.publish image.upload";
const legacyToken = "legacy-test-token-at-least-16-chars";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function ownedDb() {
  if (!mongoose.connection.db || mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database access");
  return mongoose.connection.db;
}
function form(path: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(origin + path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body) });
}
async function client(method = "none") {
  const res = await register(new Request(origin + "/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Unverified fake client", redirect_uris: [redirectUri], token_endpoint_auth_method: method, scope: scopes }) }));
  expect(res.status).toBe(201);
  return res.json();
}
function authorizationQuery(clientId: string, verifier: string, overrides: Record<string, string> = {}) {
  return new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: scopes, state: "fake-state-123", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource: getMcpResource(), ...overrides });
}
async function begin(c: { client_id: string }, overrides: Record<string, string> = {}) {
  const verifier = randomBytes(32).toString("base64url");
  const res = await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, verifier, overrides)));
  expect(res.status).toBe(303);
  const intent = new URL(res.headers.get("location")!, origin).searchParams.get("intent")!;
  expect(intent).toMatch(/^tc_intent_[A-Za-z0-9_-]{43}$/);
  return { verifier, intent };
}
async function approve(c: { client_id: string }, overrides: Record<string, string> = {}) {
  const flow = await begin(c, overrides);
  const res = await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, { Origin: origin }));
  expect(res.status).toBe(303);
  const callback = new URL(res.headers.get("location")!);
  expect(callback.origin).toBe(new URL(redirectUri).origin);
  expect(callback.searchParams.get("state")).toBe("fake-state-123");
  expect(callback.searchParams.get("iss")).toBe(origin);
  return { ...flow, code: callback.searchParams.get("code")! };
}
function exchange(c: { client_id: string; client_secret?: string; token_endpoint_auth_method?: string }, flow: { code: string; verifier: string }, overrides: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const body = { grant_type: "authorization_code", code: flow.code, redirect_uri: redirectUri, code_verifier: flow.verifier, resource: getMcpResource(), client_id: c.client_id, ...overrides };
  if (c.token_endpoint_auth_method === "client_secret_basic") headers = { authorization: "Basic " + Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64"), ...headers };
  if (c.token_endpoint_auth_method === "client_secret_post" && !("client_secret" in overrides)) Object.assign(body, { client_secret: c.client_secret });
  return token(form("/api/oauth/token", body, headers));
}

beforeEach(() => {
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("HERMES_API_TOKEN", legacyToken);
  fakeAuth.mockResolvedValue(session);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fakeAuth.mockReset();
  if (!mongoose.connection.db) return;
  const db = ownedDb();
  for (const collection of ["mcp_oauth_clients", "mcp_oauth_registration_windows", "mcp_oauth_intents", "mcp_oauth_codes", "mcp_access_grants"]) await db.collection(collection).deleteMany({});
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("OAuth authorization code flow, fake authenticated admin and isolated MongoDB", () => {
  it("closes every endpoint without opt-in before body/session/DB access", async () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    for (const handler of [consent, token, revoke]) {
      const req = form("/api/oauth/ignored", {});
      expect((await handler(req)).status).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
    expect((await authorize(new Request(origin + "/api/oauth/authorize"))).status).toBe(404);
    expect((await serverMetadata()).status).toBe(404);
    expect((await resourceMetadata()).status).toBe(404);
    expect(fakeAuth).not.toHaveBeenCalled();
  });

  it("rejects the retired resource and its persisted consent intents and authorization codes", async () => {
    const c = await client();
    const legacyResource = origin + "/api/mcp";
    const request = new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"), { resource: legacyResource }));
    const rejected = await authorize(request);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_target" });
    const pending = await begin(c);
    await ownedDb().collection("mcp_oauth_intents").updateOne({ intentHash: digest(pending.intent) }, { $set: { resource: legacyResource } });
    await expect(getConsentIntent(admin, pending.intent)).rejects.toMatchObject({ status: 400 });
    const rejectedConsent = await consent(form("/api/oauth/consent", { intent: pending.intent, decision: "approve" }, { Origin: origin }));
    expect(rejectedConsent.status).toBe(400);
    expect(rejectedConsent.headers.get("location")).toBeNull();
    const oldCode = await approve(c);
    await ownedDb().collection("mcp_oauth_codes").updateOne({ codeHash: digest(oldCode.code) }, { $set: { resource: legacyResource } });
    const exchanged = await exchange(c, oldCode);
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toMatchObject({ error: "invalid_grant" });
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({ clientId: c.client_id })).toBe(0);
    const liveCode = await approve(c);
    expect((await exchange(c, liveCode, { resource: legacyResource })).status).toBe(400);
    expect((await exchange(c, liveCode)).status).toBe(200);
  });

  it("defaults omitted registration scope to requestable guide capabilities, never consent or tokens", async () => {
    const res = await register(new Request(origin + "/api/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }) }));
    expect(res.status).toBe(201);
    const c = await res.json();
    expect(c.scope).toBe(scopes);
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({})).toBe(0);
    expect(await listMcpClientAuthorizations(admin)).toEqual([]);
    const pending = await begin(c);
    expect((await getConsentIntent(admin, pending.intent)).intent.scopes).toEqual(scopes.split(" "));
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({})).toBe(0);
    const granted = await exchange(c, await approve(c));
    expect(granted.status).toBe(200);
    expect((await granted.json()).scope).toBe(scopes);
    const readOnly = await exchange(c, await approve(c, { scope: "guide.read" }));
    expect((await readOnly.json()).scope).toBe("guide.read");
    const unknown = await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"), { scope: "guide.read guide.delete" })));
    expect(unknown.status).toBe(400);
  });

  it("preserves long opaque client state through login, consent and callbacks", async () => {
    const c = await client();
    for (const length of [1144, 4096]) {
      const state = "s".repeat(length);
      for (const decision of ["approve", "deny"]) {
        const flow = await begin(c, { state });
        expect((await getConsentIntent(admin, flow.intent)).intent.state).toBe(state);
        const res = await consent(form("/api/oauth/consent", { intent: flow.intent, decision }, { Origin: origin }));
        expect(res.status).toBe(303);
        expect(new URL(res.headers.get("location")!).searchParams.get("state")).toBe(state);
      }
      fakeAuth.mockResolvedValueOnce(null);
      const query = authorizationQuery(c.client_id, randomBytes(32).toString("base64url"), { state });
      const login = await authorize(new Request(origin + "/api/oauth/authorize?" + query));
      expect(login.status).toBe(303);
      const returnTo = new URL(login.headers.get("location")!, origin).searchParams.get("returnTo")!;
      expect(getLoginReturnTo(returnTo)).toBe(returnTo);
      expect(new URL(returnTo, origin).searchParams.get("state")).toBe(state);
    }
    for (const state of ["s".repeat(4097), "%".repeat(3000)]) {
      const res = await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"), { state })));
      expect(res.status).toBe(400);
    }
  });

  it("publishes fixed-origin metadata for only supported capabilities, not request Host or refresh", async () => {
    const as = await serverMetadata();
    expect(as.headers.get("cache-control")).toContain("no-store");
    expect(await as.json()).toMatchObject({ issuer: origin, authorization_endpoint: origin + "/api/oauth/authorize", token_endpoint: origin + "/api/oauth/token", registration_endpoint: origin + "/api/oauth/register", grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true });
    expect(await (await resourceMetadata()).json()).toMatchObject({ resource: origin + "/mcp", authorization_servers: [origin], bearer_methods_supported: ["header"] });
  });

  it.each(["none", "client_secret_basic", "client_secret_post"])("completes %s PKCE flow without issuing refresh or exposing credentials, binds client and audience, and denies REST bypass", async (method) => {
    const c = await client(method);
    const flow = await approve(c);
    const row = await ownedDb().collection("mcp_oauth_codes").findOne({ codeHash: digest(flow.code) });
    expect(row).toMatchObject({ clientId: c.client_id, resource: getMcpResource(), scopes: scopes.split(" ") });
    expect(JSON.stringify(row)).not.toContain(flow.code);
    expect(JSON.stringify(row)).not.toContain(flow.verifier);
    expect(row!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    const res = await exchange(c, flow);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.access_token).toMatch(/^tc_mcp_[A-Za-z0-9_-]{43}$/);
    expect(body.token_type.toLowerCase()).toBe("bearer");
    expect(body.expires_in).toBeGreaterThan(99 * 365 * 24 * 3600);
    expect(body.expires_in).toBeLessThanOrEqual(100 * 365 * 24 * 3600);
    expect(body.scope).toBe(scopes);
    expect(body).not.toHaveProperty("refresh_token");
    const actor = await authenticateMcpOAuthAccessToken(`Bearer ${body.access_token}`, getMcpResource());
    expect(actor.scopes).toEqual(scopes.split(" "));
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${body.access_token}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
    vi.stubEnv("MCP_OAUTH_ENABLED", "true");
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${body.access_token}`, origin + "/other")).rejects.toMatchObject({ status: 401 });
    const grant = await ownedDb().collection("mcp_access_grants").findOne({ tokenHash: digest(body.access_token) });
    expect(grant).toMatchObject({ oauthClientId: c.client_id });
    expect(JSON.stringify(grant)).not.toContain(body.access_token);
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(body.access_token);
    const replay = await exchange(c, flow);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
    expect(() => assertAdminOrToken(null, `Bearer ${body.access_token}`)).toThrow();
    const denied = await createGuide(new Request(origin + "/api/guides", { method: "POST", headers: { authorization: `Bearer ${body.access_token}`, "Content-Type": "application/json" }, body: "{}" }));
    expect(denied.status).toBe(401);
    expect(await listMcpClientAuthorizations(admin)).toHaveLength(1);
  });

  it("requires explicit consent every time, carries the flow through login, and does not allocate anonymous intents", async () => {
    const c = await client();
    fakeAuth.mockResolvedValue(null);
    const query = authorizationQuery(c.client_id, randomBytes(32).toString("base64url"));
    const res = await authorize(new Request("https://spoofed.example.test/api/oauth/authorize?" + query, { headers: { authorization: `Bearer ${legacyToken}` } }));
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!, origin);
    expect(location.origin).toBe(origin);
    expect(location.pathname).toBe("/admin/login");
    expect(getLoginReturnTo(location.searchParams.get("returnTo"))).toBe("/api/oauth/authorize?" + query);
    expect(await ownedDb().collection("mcp_oauth_intents").countDocuments({})).toBe(0);
    expect(await ownedDb().collection("mcp_oauth_codes").countDocuments({})).toBe(0);
    fakeAuth.mockResolvedValue(session);
    await approve(c);
    await begin(c);
    expect(await ownedDb().collection("mcp_oauth_codes").countDocuments({})).toBe(1);
  });

  it.each<Record<string, string>>([
    { redirect_uri: "https://evil.example.test/callback" }, { redirect_uri: redirectUri + "&extra=1" },
    { resource: origin + "/other" }, { state: "" }, { code_challenge_method: "plain" },
    { code_challenge: "short" }, { response_type: "token" }, { scope: "guide.read guide.delete" },
    { scope: "guide.publish" }, { scope: "guide.read guide.read" }, { scope: "guide.read  guide.publish" },
  ])("rejects unsafe authorization input %j without redirect or intent", async (overrides) => {
    const c = await client();
    const res = await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"), overrides)));
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
    expect(await ownedDb().collection("mcp_oauth_intents").countDocuments({})).toBe(0);
  });

  it("rejects duplicate/missing authorization fields and scopes beyond registration", async () => {
    const c = await client();
    const query = authorizationQuery(c.client_id, randomBytes(32).toString("base64url"));
    query.append("resource", getMcpResource());
    expect((await authorize(new Request(origin + "/api/oauth/authorize?" + query))).status).toBe(400);
    query.delete("resource");
    expect((await authorize(new Request(origin + "/api/oauth/authorize?" + query))).status).toBe(400);
    await ownedDb().collection("mcp_oauth_clients").updateOne({ clientId: c.client_id }, { $set: { scopes: ["guide.read"] } });
    expect((await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"))))).status).toBe(400);
  });

  it("denies consent without granting anything and consumes the confirmation exactly once", async () => {
    const c = await client();
    const flow = await begin(c);
    const res = await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "deny" }, { Origin: origin }));
    const callback = new URL(res.headers.get("location")!);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe("fake-state-123");
    expect(callback.searchParams.get("iss")).toBe(origin);
    expect(await ownedDb().collection("mcp_oauth_codes").countDocuments({})).toBe(0);
    expect(await listMcpClientAuthorizations(admin)).toHaveLength(0);
    expect((await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, { Origin: origin }))).status).toBe(400);
    const browserReplay = await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, { Origin: origin, Accept: "text/html" }));
    expect(browserReplay.status).toBe(303);
    expect(browserReplay.headers.get("location")).toBe("/admin/oauth/consent");
  });

  it("requires real admin session + fixed Origin for consent/revoke; legacy Token and spoofed Host cannot bypass", async () => {
    const c = await client();
    const flow = await begin(c);
    for (const originHeader of [undefined, "null", "https://evil.example.test"]) {
      const headers = { authorization: `Bearer ${legacyToken}`, ...(originHeader ? { Origin: originHeader } : {}) };
      expect((await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, headers))).status).toBe(403);
      expect((await revoke(form("/api/oauth/revoke-client", { client_id: c.client_id }, headers))).status).toBe(403);
    }
    fakeAuth.mockResolvedValue(null);
    const headers = { authorization: `Bearer ${legacyToken}`, Origin: origin };
    expect((await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, headers))).status).toBe(401);
    expect((await revoke(form("/api/oauth/revoke-client", { client_id: c.client_id }, headers))).status).toBe(401);
    expect(await ownedDb().collection("mcp_oauth_codes").countDocuments({})).toBe(0);
  });

  it("rejects consent tampering, expired intents and owner mismatch without consuming the valid intent", async () => {
    const c = await client();
    const flow = await begin(c);
    for (const field of ["scopes", "client_id", "role", "resource"]) {
      expect((await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve", [field]: "tampered" }, { Origin: origin }))).status).toBe(400);
    }
    await ownedDb().collection("mcp_oauth_intents").updateOne({ intentHash: digest(flow.intent) }, { $set: { adminEmail: "other@example.test" } });
    await expect(getConsentIntent(admin, flow.intent)).rejects.toMatchObject({ status: 400 });
    await ownedDb().collection("mcp_oauth_intents").updateOne({ intentHash: digest(flow.intent) }, { $set: { adminEmail: admin.user.email, expiresAt: new Date() } });
    expect((await consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, { Origin: origin }))).status).toBe(400);
    expect(await ownedDb().collection("mcp_oauth_codes").countDocuments({})).toBe(0);
  });

  it("handles concurrent consent and code exchange with at most one winner each", async () => {
    const c = await client();
    const flow = await begin(c);
    const confirmations = await Promise.all(Array.from({ length: 5 }, () => consent(form("/api/oauth/consent", { intent: flow.intent, decision: "approve" }, { Origin: origin }))));
    expect(confirmations.filter((res) => res.status === 303)).toHaveLength(1);
    expect(confirmations.filter((res) => res.status === 400)).toHaveLength(4);
    const callback = new URL(confirmations.find((res) => res.status === 303)!.headers.get("location")!);
    const code = callback.searchParams.get("code")!;
    const results = await Promise.all(Array.from({ length: 5 }, () => exchange(c, { ...flow, code })));
    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 400)).toHaveLength(4);
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({})).toBe(1);
  });

  it("binds codes to client/resource and consumes codes on bad PKCE or callback matching", async () => {
    const c = await client();
    const other = await client();
    const flow = await approve(c);
    expect((await exchange(other, flow)).status).toBe(400);
    expect((await exchange(c, flow, { resource: origin + "/other" })).status).toBe(400);
    expect((await exchange(c, flow, { code_verifier: "x".repeat(43) })).status).toBe(400);
    expect((await exchange(c, flow)).status).toBe(400);
    const second = await approve(c);
    expect((await exchange(c, second, { redirect_uri: redirectUri + "&changed=1" })).status).toBe(400);
    expect((await exchange(c, second)).status).toBe(400);
    expect(await ownedDb().collection("mcp_access_grants").countDocuments({})).toBe(0);
  });

  it("enforces the exact registered auth method and rejects mismatched/mixed credentials without burning codes", async () => {
    for (const method of ["none", "client_secret_basic", "client_secret_post"]) {
      const c = await client(method);
      const flow = await approve(c);
      let wrong: Response;
      if (method === "none") wrong = await exchange(c, flow, { client_secret: "fake-unwanted-secret" });
      else if (method === "client_secret_basic") wrong = await exchange(c, flow, {}, { authorization: "Basic " + Buffer.from(`${c.client_id}:wrong-secret`).toString("base64") });
      else wrong = await exchange(c, flow, { client_secret: "wrong-secret" });
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ error: "invalid_client" });
      if (method === "client_secret_basic") {
        expect((await exchange(c, flow, { client_secret: c.client_secret })).status).toBe(401);
        const post = { grant_type: "authorization_code", code: flow.code, redirect_uri: redirectUri, code_verifier: flow.verifier, resource: getMcpResource(), client_id: c.client_id, client_secret: c.client_secret };
        expect((await token(form("/api/oauth/token", post))).status).toBe(401);
      }
      if (method === "client_secret_post") {
        const basic = "Basic " + Buffer.from(`${c.client_id}:${c.client_secret}`).toString("base64");
        expect((await exchange(c, flow, {}, { authorization: basic })).status).toBe(401);
      }
      expect((await exchange(c, flow)).status).toBe(200);
    }
  });

  it("persistently revokes client tokens, pending intents and codes, without affecting other clients", async () => {
    const c = await client();
    const other = await client();
    const issued = await exchange(c, await approve(c));
    const accessToken = (await issued.json()).access_token;
    const otherToken = (await (await exchange(other, await approve(other))).json()).access_token;
    const unusedCode = await approve(c);
    const pending = await begin(c);
    expect((await revoke(form("/api/oauth/revoke-client", { client_id: c.client_id }, { Origin: origin }))).status).toBe(303);
    expect((await revoke(form("/api/oauth/revoke-client", { client_id: c.client_id }, { Origin: origin }))).status).toBe(303);
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${accessToken}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${otherToken}`, getMcpResource())).resolves.toMatchObject({ authKind: "restricted-ai" });
    expect((await exchange(c, unusedCode)).status).toBe(401);
    expect((await consent(form("/api/oauth/consent", { intent: pending.intent, decision: "approve" }, { Origin: origin }))).status).toBe(400);
    const reopened = await authorize(new Request(origin + "/api/oauth/authorize?" + authorizationQuery(c.client_id, randomBytes(32).toString("base64url"))));
    expect(reopened.status).toBe(400);
    const replacement = await client();
    expect(replacement.client_id).not.toBe(c.client_id);
    expect((await exchange(replacement, await approve(replacement))).status).toBe(200);
  });

  it("rejects bare internal grants and checks expiry on codes, client registration and access grants rather than relying on TTL", async () => {
    const bare = await issueMcpAccessGrant(admin, { clientId: "internal-test-client", scopes: ["guide.read"] });
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${bare.accessToken}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
    const c = await client();
    const expired = await approve(c);
    await ownedDb().collection("mcp_oauth_codes").updateOne({ codeHash: digest(expired.code) }, { $set: { expiresAt: new Date() } });
    expect((await exchange(c, expired)).status).toBe(400);
    const flow = await approve(c, { scope: "guide.read" });
    const readOnly = await (await exchange(c, flow)).json();
    expect(readOnly.scope).toBe("guide.read");
    const readActor = await authenticateMcpOAuthAccessToken(`Bearer ${readOnly.access_token}`, getMcpResource());
    expect(() => assertCapability(readActor, "guide.publish")).toThrow();
    const accessToken = readOnly.access_token;
    await ownedDb().collection("mcp_access_grants").updateOne({ tokenHash: digest(accessToken) }, { $set: { expiresAt: new Date() } });
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${accessToken}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
    const liveToken = (await (await exchange(c, await approve(c))).json()).access_token;
    await ownedDb().collection("mcp_oauth_clients").updateOne({ clientId: c.client_id }, { $set: { expiresAt: new Date() } });
    await expect(authenticateMcpOAuthAccessToken(`Bearer ${liveToken}`, getMcpResource())).rejects.toMatchObject({ status: 401 });
    for (const collection of ["mcp_oauth_intents", "mcp_oauth_codes"]) expect(await ownedDb().collection(collection).indexes()).toEqual(expect.arrayContaining([expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 })]));
  });

  it("bounds forms and rejects duplicate fields, refresh grants and self-reported roles", async () => {
    const c = await client();
    const flow = await approve(c);
    expect((await exchange(c, flow, { grant_type: "refresh_token" })).status).toBe(400);
    expect((await exchange(c, flow, { role: "admin" })).status).toBe(400);
    const duplicate = new Request(origin + "/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=authorization_code&grant_type=refresh_token" });
    expect((await token(duplicate)).status).toBe(400);
    const oversized = new Request(origin + "/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "padding=" + "x".repeat(16 * 1024) });
    expect((await token(oversized)).status).toBe(413);
    expect((await token(new Request(origin + "/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).status).toBe(415);
    expect((await exchange(c, flow)).status).toBe(200);
  });
});

describe("safe OAuth login return", () => {
  it.each([undefined, "https://evil.test/", "//evil.test/", "/\\evil.test/", "/admin/guides?next=https://evil.test", "/api/oauth/authorize#fragment", "/api/oauth/authorize", "/admin/oauth/consent?intent=bad", "x".repeat(8193)])("rejects external or unapproved destination %s", (value) => {
    expect(getLoginReturnTo(value)).toBe("/admin/guides");
  });
  it("preserves only bounded internal authorize and consent destinations", () => {
    const intent = "tc_intent_" + "x".repeat(43);
    expect(getLoginReturnTo("/admin/oauth/consent?intent=" + intent)).toBe("/admin/oauth/consent?intent=" + intent);
    expect(getLoginReturnTo("/api/oauth/authorize?state=safe" )).toBe("/api/oauth/authorize?state=safe");
  });
});
