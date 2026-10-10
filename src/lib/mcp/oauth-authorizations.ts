import { createHash, randomBytes } from "node:crypto";
import OAuth2Server from "@node-oauth/oauth2-server";
import mongoose, { Schema, type Model } from "mongoose";
import { z } from "zod";
import { assertAdmin, logAdminAction, type AdminActor } from "@/lib/admin";
import { assertCapability, type AiGuideScope } from "@/lib/capabilities";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getMcpResource, issueMcpOAuthAccessGrant } from "@/lib/mcp/access-grants";
import { authorizeMcpClient, findRegisteredMcpClient, type RegisteredMcpClient } from "@/lib/mcp/oauth-clients";

const lifetimeMs = 5 * 60 * 1000;
const clientId = z.string().regex(/^tc_oauth_[A-Za-z0-9_-]{43}$/);
const authorizationInput = z.object({
  client_id: clientId,
  redirect_uri: z.string().min(1).max(2048),
  response_type: z.literal("code"),
  scope: z.string().min(1).max(256).default("guide.read"),
  state: z.string().min(1).max(4096).regex(/^[\x20-\x7e]+$/),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  resource: z.string().min(1).max(2048),
}).strict();

type AuthorizationData = {
  clientId: string;
  redirectUri: string;
  scopes: AiGuideScope[];
  codeChallenge: string;
  resource: string;
  adminEmail: string;
  expiresAt: Date;
  consumedAt?: Date;
};
type ConsentIntent = AuthorizationData & { intentHash: string; state: string };
type StoredCode = AuthorizationData & { codeHash: string };
const fields = {
  clientId: { type: String, required: true },
  redirectUri: { type: String, required: true },
  scopes: { type: [String], required: true },
  codeChallenge: { type: String, required: true },
  resource: { type: String, required: true },
  adminEmail: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
};
const intentSchema = new Schema<ConsentIntent>({ ...fields, intentHash: { type: String, required: true }, state: { type: String, required: true } }, { collection: "mcp_oauth_intents", versionKey: false });
intentSchema.index({ intentHash: 1 }, { unique: true });
intentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const codeSchema = new Schema<StoredCode>({ ...fields, codeHash: { type: String, required: true } }, { collection: "mcp_oauth_codes", versionKey: false });
codeSchema.index({ codeHash: 1 }, { unique: true });
codeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Intent: Model<ConsentIntent> = mongoose.models.McpOAuthIntent as Model<ConsentIntent> || mongoose.model("McpOAuthIntent", intentSchema);
const Code: Model<StoredCode> = mongoose.models.McpOAuthCode as Model<StoredCode> || mongoose.model("McpOAuthCode", codeSchema);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function ready() {
  await connectDb();
  await Promise.all([Intent.init(), Code.init()]);
}
function sessionOnly(actor: AdminActor) {
  assertCapability(actor, "config.manage");
  assertAdmin(actor);
}
function invalidIntent(): never {
  throw new HttpError(400, "invalid_request", "Authorization expired or already used");
}

export async function validateAuthorizationRequest(url: URL) {
  const entries = [...url.searchParams];
  if (url.search.length > 8192 || new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new HttpError(400, "invalid_request", "Invalid authorization request");
  }
  const parsed = authorizationInput.safeParse(Object.fromEntries(entries));
  if (!parsed.success) throw new HttpError(400, "invalid_request", "Invalid authorization request");
  const input = parsed.data;
  if (input.resource !== getMcpResource()) throw new HttpError(400, "invalid_target", "Invalid resource");
  const client = await findRegisteredMcpClient(input.client_id);
  if (!client || !client.redirectUris.includes(input.redirect_uri)) throw new HttpError(400, "invalid_client", "Invalid client or redirect URI");
  const scopes = input.scope.split(" ");
  if (!scopes.includes("guide.read") || new Set(scopes).size !== scopes.length || scopes.some((scope) => !client.scopes.some((allowed) => scope === allowed))) {
    throw new HttpError(400, "invalid_scope", "Invalid scope");
  }
  return { input, client, scopes: scopes as AiGuideScope[] };
}

export async function createConsentIntent(actor: AdminActor, url: URL) {
  sessionOnly(actor);
  const { input, client, scopes } = await validateAuthorizationRequest(url);
  const intent = `tc_intent_${randomBytes(32).toString("base64url")}`;
  await ready();
  await Intent.create({
    intentHash: digest(intent), clientId: client.clientId, redirectUri: input.redirect_uri,
    scopes, state: input.state, codeChallenge: input.code_challenge, resource: input.resource,
    adminEmail: actor.user.email.toLowerCase(), expiresAt: new Date(Date.now() + lifetimeMs),
  });
  return intent;
}

export async function getConsentIntent(actor: AdminActor, intent: string) {
  sessionOnly(actor);
  if (!/^tc_intent_[A-Za-z0-9_-]{43}$/.test(intent)) invalidIntent();
  await ready();
  const row = await Intent.findOne({ intentHash: digest(intent), adminEmail: actor.user.email.toLowerCase(), expiresAt: { $gt: new Date() }, consumedAt: null }).lean();
  if (!row || row.resource !== getMcpResource()) invalidIntent();
  const client = await findRegisteredMcpClient(row.clientId);
  if (!client || !client.redirectUris.includes(row.redirectUri) || row.scopes.some((scope) => !client.scopes.includes(scope))) invalidIntent();
  return { intent: row, client };
}

function libraryClient(client: RegisteredMcpClient): OAuth2Server.Client {
  return { id: client.clientId, grants: ["authorization_code"], redirectUris: client.redirectUris };
}

function oauthServer(client: RegisteredMcpClient, resource: string, consent?: { actor: AdminActor; intent: ConsentIntent }) {
  const model: OAuth2Server.AuthorizationCodeModel = {
    getAccessToken: async () => false, // Business MCP uses the audience/client-aware grant verifier.
    getClient: async (id) => {
      const active = id === client.clientId ? await findRegisteredMcpClient(id) : null;
      return active ? libraryClient(active) : false;
    },
    generateAuthorizationCode: async () => `tc_code_${randomBytes(32).toString("base64url")}`,
    generateRefreshToken: async () => "", // No refresh issuance or refresh grant.
    validateRedirectUri: async (uri) => client.redirectUris.includes(uri),
    validateScope: async (_user, _client, scopes) => scopes?.includes("guide.read") && scopes.every((scope) => client.scopes.some((allowed) => scope === allowed)) ? scopes : false,
    saveAuthorizationCode: async (code, savedClient, user) => {
      if (!consent || code.redirectUri !== consent.intent.redirectUri || code.codeChallenge !== consent.intent.codeChallenge || code.codeChallengeMethod !== "S256" || code.scope?.join(" ") !== consent.intent.scopes.join(" ")) invalidIntent();
      const authorized = await authorizeMcpClient(consent.actor, client.clientId, consent.intent.scopes);
      if (!authorized) invalidIntent();
      const expiresAt = new Date(Math.min(code.expiresAt.getTime(), client.expiresAt.getTime()));
      await Code.create({
        codeHash: digest(code.authorizationCode), clientId: client.clientId, redirectUri: code.redirectUri,
        scopes: consent.intent.scopes, codeChallenge: code.codeChallenge, resource,
        adminEmail: consent.actor.user.email.toLowerCase(), expiresAt,
      });
      logAdminAction(consent.actor, "mcp.client.authorize", null, null, null);
      return { ...code, expiresAt, client: savedClient, user };
    },
    getAuthorizationCode: async (value) => {
      if (!/^tc_code_[A-Za-z0-9_-]{43}$/.test(value)) return false;
      await ready();
      const row = await Code.findOne({ codeHash: digest(value), clientId: client.clientId, resource, expiresAt: { $gt: new Date() }, consumedAt: null }).lean();
      if (!row || !await findRegisteredMcpClient(row.clientId)) return false;
      return {
        authorizationCode: value, expiresAt: row.expiresAt, redirectUri: row.redirectUri,
        scope: row.scopes, codeChallenge: row.codeChallenge, codeChallengeMethod: "S256",
        client: libraryClient(client), user: { id: "admin", email: row.adminEmail },
      };
    },
    revokeAuthorizationCode: async (code) => {
      const result = await Code.updateOne({ codeHash: digest(code.authorizationCode), clientId: client.clientId, resource, expiresAt: { $gt: new Date() }, consumedAt: null }, { $set: { consumedAt: new Date() } });
      return result.modifiedCount === 1;
    },
    saveToken: async (token, savedClient, user) => {
      const actor: AdminActor = { authKind: "session", actorLabel: user.email, user: { id: "admin", email: user.email } };
      sessionOnly(actor);
      const grant = await issueMcpOAuthAccessGrant(actor, { clientId: savedClient.id, scopes: token.scope });
      // The shared grant issuer is canonical; the library's provisional token is never returned.
      return { accessToken: grant.accessToken, accessTokenExpiresAt: new Date(grant.expiresAt), scope: grant.scopes, client: savedClient, user };
    },
  };
  return new OAuth2Server({ model, authorizationCodeLifetime: 300, accessTokenLifetime: 900, allowEmptyState: false });
}

export async function decideConsent(actor: AdminActor, value: string, decision: "approve" | "deny") {
  if (decision !== "approve" && decision !== "deny") invalidIntent();
  const { intent, client } = await getConsentIntent(actor, value);
  const consumed = await Intent.findOneAndUpdate({ intentHash: intent.intentHash, adminEmail: actor.user.email.toLowerCase(), expiresAt: { $gt: new Date() }, consumedAt: null }, { $set: { consumedAt: new Date() } }, { returnDocument: "after" }).lean();
  if (!consumed) invalidIntent();
  const callback = new URL(intent.redirectUri);
  callback.searchParams.set("state", intent.state);
  callback.searchParams.set("iss", new URL(getMcpResource()).origin);
  if (decision === "deny") {
    callback.searchParams.set("error", "access_denied");
    return callback.href;
  }
  const server = oauthServer(client, intent.resource, { actor, intent });
  const code = await server.authorize(new OAuth2Server.Request({
    method: "GET", headers: {}, body: {}, query: {
      client_id: client.clientId, redirect_uri: intent.redirectUri, response_type: "code",
      scope: intent.scopes.join(" "), state: intent.state, code_challenge: intent.codeChallenge,
      code_challenge_method: "S256",
    },
  }), new OAuth2Server.Response(), { authenticateHandler: { handle: async () => actor.user } });
  callback.searchParams.set("code", code.authorizationCode);
  return callback.href;
}

export async function exchangeAuthorizationCode(client: RegisteredMcpClient, body: Record<string, string>) {
  const response = new OAuth2Server.Response();
  // HTTP client authentication is already checked against the exact registered method.
  const normalizedBody: Record<string, string> = { ...body, client_id: client.clientId };
  delete normalizedBody.client_secret;
  const request = new OAuth2Server.Request({ method: "POST", query: {}, headers: {
    "content-type": "application/x-www-form-urlencoded",
    "content-length": String(Buffer.byteLength(new URLSearchParams(normalizedBody).toString())),
  }, body: normalizedBody });
  await oauthServer(client, body.resource).token(request, response, { requireClientAuthentication: { authorization_code: false } });
  return response.body;
}
