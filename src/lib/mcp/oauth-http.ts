import { createHash } from "node:crypto";
import OAuth2Server from "@node-oauth/oauth2-server";
import { auth } from "@/auth";
import { assertAdminOrToken, safeTokenCompare, type AdminActor } from "@/lib/admin";
import { AI_GUIDE_SCOPES } from "@/lib/capabilities";
import { getAuthEnv } from "@/lib/env";
import { HttpError, PUBLIC_NO_STORE_HEADERS } from "@/lib/http";
import { getMcpResource } from "@/lib/mcp/access-grants";
import { findRegisteredMcpClient } from "@/lib/mcp/oauth-clients";

export const OAUTH_HEADERS = { ...PUBLIC_NO_STORE_HEADERS, Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export function oauthDisabled() {
  return process.env.MCP_OAUTH_ENABLED !== "true" ? Response.json({ error: "not_found" }, { status: 404, headers: OAUTH_HEADERS }) : null;
}
export function oauthRedirect(url: string) {
  return new Response(null, { status: 303, headers: { ...OAUTH_HEADERS, Location: url } });
}
export function oauthError(error: unknown) {
  let status = 500;
  let code = "server_error";
  if (error instanceof HttpError) {
    status = error.status;
    code = /^[a-z_]+$/.test(error.code) ? error.code : "invalid_request";
  } else if (error instanceof OAuth2Server.OAuthError) {
    status = error.code;
    code = status >= 500 ? "server_error" : error.name;
  }
  if (status >= 500) console.error("OAuth request failed", error instanceof Error ? error.name : "UnknownError");
  const headers = code === "invalid_client" && status === 401 ? { ...OAUTH_HEADERS, "WWW-Authenticate": 'Basic realm="Travel Cards"' } : OAUTH_HEADERS;
  return Response.json({ error: code }, { status, headers });
}
export async function oauthAdmin(request: Request): Promise<AdminActor> {
  // Deliberately ignore Authorization: the legacy admin Token cannot provide consent.
  const actor = assertAdminOrToken(await auth(), null);
  if (request.headers.get("origin") !== getAuthEnv().authOrigin) throw new HttpError(403, "access_denied", "Admin action requires the fixed server origin");
  return actor;
}
export function authorizationServerMetadata() {
  const issuer = new URL(getMcpResource()).origin;
  return {
    issuer, authorization_endpoint: `${issuer}/api/oauth/authorize`, token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`, response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"], scopes_supported: [...AI_GUIDE_SCOPES],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true,
  };
}
export function protectedResourceMetadata() {
  const resource = getMcpResource();
  return { resource, authorization_servers: [new URL(resource).origin], scopes_supported: [...AI_GUIDE_SCOPES], bearer_methods_supported: ["header"], resource_name: "旅行卡片攻略" };
}

function invalidClient(): never {
  throw new HttpError(401, "invalid_client", "Invalid client authentication");
}
export async function authenticateOAuthClient(request: Request, body: Record<string, string>) {
  const header = request.headers.get("authorization");
  let id = body.client_id;
  let secret = body.client_secret;
  if (header !== null) {
    const match = header.length <= 512 ? header.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i) : null;
    if (!match || body.client_secret !== undefined) invalidClient();
    const bytes = Buffer.from(match[1], "base64");
    if (bytes.toString("base64") !== match[1]) invalidClient();
    try {
      const credentials = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const colon = credentials.indexOf(":");
      if (colon < 1) invalidClient();
      const decodedId = decodeURIComponent(credentials.slice(0, colon).replace(/\+/g, " "));
      if (id !== undefined && id !== decodedId) invalidClient();
      id = decodedId;
      secret = decodeURIComponent(credentials.slice(colon + 1).replace(/\+/g, " "));
    } catch {
      invalidClient();
    }
  }
  const client = await findRegisteredMcpClient(id);
  if (!client) invalidClient();
  if (client.tokenEndpointAuthMethod === "none") {
    if (header !== null || secret !== undefined) invalidClient();
  } else {
    if ((client.tokenEndpointAuthMethod === "client_secret_basic") !== (header !== null)) invalidClient();
    if (!secret || secret.length > 128 || !client.secretHash || !safeTokenCompare(createHash("sha256").update(secret).digest("hex"), client.secretHash)) invalidClient();
  }
  return client;
}
