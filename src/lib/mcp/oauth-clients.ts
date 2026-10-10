import { createHash, randomBytes } from "node:crypto";
import mongoose, { Schema, type Model } from "mongoose";
import { z } from "zod";
import { assertCapability, type ApiActor, AI_GUIDE_SCOPES, type AiGuideScope } from "@/lib/capabilities";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";

export const MCP_REGISTRATION_MAX_BYTES = 16 * 1024;
export const MCP_REGISTRATION_LIMIT = 100;
const HOUR_MS = 60 * 60 * 1000;
const CLIENT_LIFETIME_MS = 100 * 365 * 24 * HOUR_MS;

const redirectUri = z.string().min(1).max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return /^https:\/\/[^/]/.test(value) && !/[\s*\\]/.test(value) && !value.includes("#") &&
      url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
});
const metadataSchema = z.object({
  client_name: z.string().trim().min(1).max(128).optional(),
  redirect_uris: z.array(redirectUri).min(1).max(10).refine((uris) => new Set(uris).size === uris.length),
  token_endpoint_auth_method: z.enum(["none", "client_secret_basic", "client_secret_post"]).default("client_secret_basic"),
  grant_types: z.tuple([z.literal("authorization_code")]).default(["authorization_code"]),
  response_types: z.tuple([z.literal("code")]).default(["code"]),
  scope: z.string().max(256).default(AI_GUIDE_SCOPES.join(" ")).refine((value) => {
    const scopes = value.split(" ");
    return scopes.includes("guide.read") && new Set(scopes).size === scopes.length &&
      scopes.every((scope) => AI_GUIDE_SCOPES.some((allowed) => allowed === scope));
  }),
});

export type RegisteredMcpClient = {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  scopes: AiGuideScope[];
  secretHash?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  authorizedAt?: Date;
  authorizedScopes?: AiGuideScope[];
};
const clientSchema = new Schema<RegisteredMcpClient>({
  clientId: { type: String, required: true },
  clientName: String,
  redirectUris: { type: [String], required: true },
  tokenEndpointAuthMethod: { type: String, required: true },
  scopes: { type: [String], required: true },
  secretHash: String,
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  authorizedAt: Date,
  authorizedScopes: { type: [String], default: undefined },
}, { collection: "mcp_oauth_clients", versionKey: false });
clientSchema.index({ clientId: 1 }, { unique: true });
clientSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
clientSchema.index({ authorizedAt: -1 }, { sparse: true });
const Client: Model<RegisteredMcpClient> = mongoose.models.McpOAuthClient as Model<RegisteredMcpClient> || mongoose.model("McpOAuthClient", clientSchema);

type RegistrationWindow = { _id: string; used: number; expiresAt: Date };
const windowSchema = new Schema<RegistrationWindow>({
  _id: { type: String, required: true },
  used: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
}, { collection: "mcp_oauth_registration_windows", versionKey: false });
windowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Window: Model<RegistrationWindow> = mongoose.models.McpOAuthRegistrationWindow as Model<RegistrationWindow> || mongoose.model("McpOAuthRegistrationWindow", windowSchema);

async function ready() {
  await connectDb();
  await Promise.all([Client.init(), Window.init()]);
}

// Global DB quota, not an IP/header-based limit that untrusted proxies can bypass.
export async function takeMcpRegistrationQuota() {
  const now = Date.now();
  const hour = Math.floor(now / HOUR_MS);
  await ready();
  const window = await Window.findOneAndUpdate({ _id: String(hour) }, {
    $inc: { used: 1 },
    $setOnInsert: { expiresAt: new Date((hour + 2) * HOUR_MS) },
  }, { upsert: true, returnDocument: "after" }).lean();
  return {
    allowed: window!.used <= MCP_REGISTRATION_LIMIT,
    retryAfter: Math.max(1, Math.ceil(((hour + 1) * HOUR_MS - now) / 1000)),
  };
}

export async function registerMcpClient(input: unknown) {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) {
    const redirectError = parsed.error.issues.some((issue) => issue.path[0] === "redirect_uris");
    throw new HttpError(400, redirectError ? "invalid_redirect_uri" : "invalid_client_metadata", "Invalid client metadata");
  }
  const metadata = parsed.data;
  const clientId = `tc_oauth_${randomBytes(32).toString("base64url")}`;
  const secret = metadata.token_endpoint_auth_method === "none" ? undefined : `tc_oauth_secret_${randomBytes(32).toString("base64url")}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CLIENT_LIFETIME_MS);
  await ready();
  await Client.create({
    clientId,
    clientName: metadata.client_name,
    redirectUris: metadata.redirect_uris,
    tokenEndpointAuthMethod: metadata.token_endpoint_auth_method,
    scopes: metadata.scope.split(" ") as AiGuideScope[],
    secretHash: secret ? createHash("sha256").update(secret).digest("hex") : undefined,
    createdAt,
    expiresAt,
  });
  return {
    ...metadata,
    client_id: clientId,
    client_id_issued_at: Math.floor(createdAt.getTime() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}),
  };
}

// Registration is metadata only; this lookup never grants access or establishes consent.
export async function findRegisteredMcpClient(clientId: unknown): Promise<RegisteredMcpClient | null> {
  if (typeof clientId !== "string" || !/^tc_oauth_[A-Za-z0-9_-]{43}$/.test(clientId)) return null;
  await ready();
  return Client.findOne({ clientId, expiresAt: { $gt: new Date() }, revokedAt: null }).lean();
}

export async function authorizeMcpClient(actor: ApiActor, clientId: string, scopes: AiGuideScope[]) {
  assertCapability(actor, "config.manage");
  const client = await findRegisteredMcpClient(clientId);
  if (!client || !scopes.includes("guide.read") || scopes.some((scope) => !client.scopes.includes(scope))) {
    throw new HttpError(400, "invalid_client", "Client registration is not active");
  }
  return Client.findOneAndUpdate({ clientId, expiresAt: { $gt: new Date() }, revokedAt: null }, {
    $set: { authorizedAt: new Date() }, $addToSet: { authorizedScopes: { $each: scopes } },
  }, { returnDocument: "after" }).lean();
}

export async function listMcpClientAuthorizations(actor: ApiActor) {
  assertCapability(actor, "config.manage");
  await ready();
  return Client.find({ authorizedAt: { $exists: true }, expiresAt: { $gt: new Date() } })
    .select("clientId clientName authorizedAt authorizedScopes expiresAt revokedAt -_id").sort({ authorizedAt: -1 }).lean();
}

export async function revokeMcpClient(actor: ApiActor, clientId: string): Promise<void> {
  assertCapability(actor, "config.manage");
  if (!/^tc_oauth_[A-Za-z0-9_-]{43}$/.test(clientId)) throw new HttpError(400, "invalid_client", "Invalid client");
  await ready();
  // This persistent root state invalidates intents, codes and tokens across all workers.
  await Client.updateOne({ clientId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
