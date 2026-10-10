import { createHash, randomBytes } from "node:crypto";
import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import { logAdminAction } from "@/lib/admin";
import { AI_GUIDE_SCOPES, assertCapability, type ApiActor } from "@/lib/capabilities";
import { connectDb } from "@/lib/db";
import { getAuthEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

const grantInput = z.object({
  clientId: z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/),
  scopes: z.array(z.enum(AI_GUIDE_SCOPES)).min(1).max(AI_GUIDE_SCOPES.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, "scopes 不可重复")
    .refine((scopes) => scopes.includes("guide.read"), "需要 guide.read 基础权限"),
}).strict();
const grantIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const lifetimeSeconds = 15 * 60;

const grantSchema = new Schema({
  tokenHash: { type: String, required: true, select: false },
  clientId: { type: String, required: true },
  resource: { type: String, required: true },
  scopes: { type: [String], enum: AI_GUIDE_SCOPES, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
}, { timestamps: true, versionKey: false });
grantSchema.index({ tokenHash: 1 }, { unique: true });
grantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const GrantModel = mongoose.models.McpAccessGrant || mongoose.model("McpAccessGrant", grantSchema, "mcp_access_grants");

async function ready() {
  await connectDb();
  await GrantModel.init();
}
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function unauthorized(): never {
  throw new HttpError(401, "UNAUTHORIZED", "需要有效的 MCP 访问令牌");
}

export function getMcpResource(): string {
  const origin = new URL(getAuthEnv().authOrigin);
  if (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
    throw new Error("MCP authorization requires HTTPS outside loopback development");
  }
  return new URL("/api/mcp", origin).href;
}

// Internal only: the future OAuth consent/code flow must validate the registered client
// before calling this. No HTTP signing endpoint or automatic client authorization exists.
export async function issueMcpAccessGrant(actor: ApiActor, input: unknown) {
  assertCapability(actor, "config.manage");
  const { clientId, scopes } = grantInput.parse(input);
  const resource = getMcpResource();
  const accessToken = `tc_mcp_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);
  await ready();
  const grant = await GrantModel.create({ tokenHash: digest(accessToken), clientId, resource, scopes, expiresAt });
  logAdminAction(actor, "mcp.grant.issue", null, null, null);
  // This is the only return of the plaintext token. Never log or supply it to an LLM.
  return { grantId: String(grant._id), accessToken, tokenType: "Bearer" as const, expiresIn: lifetimeSeconds, expiresAt: expiresAt.toISOString(), resource, scopes };
}

export async function authenticateMcpAccessToken(authHeader: string | null, resource: string): Promise<Extract<ApiActor, { authKind: "restricted-ai" }>> {
  const match = authHeader?.match(/^Bearer\s+(tc_mcp_[A-Za-z0-9_-]{43})$/i);
  if (!match || resource !== getMcpResource()) unauthorized();
  await ready();
  // Expiry/revocation are checked on every request; TTL deletion is cleanup, not authorization.
  const grant = await GrantModel.findOne({
    tokenHash: digest(match[1]), resource,
    expiresAt: { $gt: new Date() }, revokedAt: { $exists: false },
  }).lean();
  if (!grant) unauthorized();
  const { scopes } = grantInput.parse({ clientId: grant.clientId, scopes: grant.scopes });
  return { authKind: "restricted-ai", actorLabel: `mcp-grant:${String(grant._id)}`, scopes };
}

export async function revokeMcpAccessGrant(actor: ApiActor, grantId: string): Promise<void> {
  assertCapability(actor, "config.manage");
  const id = grantIdSchema.parse(grantId);
  await ready();
  // Idempotent and persistent across workers. Already authenticated in-flight work is not cancelled.
  await GrantModel.updateOne({ _id: id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  logAdminAction(actor, "mcp.grant.revoke", null, null, null);
}
