import { z } from "zod";
import { HttpError, readFormBody } from "@/lib/http";
import { getMcpResource } from "@/lib/mcp/access-grants";
import { exchangeAuthorizationCode } from "@/lib/mcp/oauth-authorizations";
import { authenticateOAuthClient, OAUTH_HEADERS, oauthCorsHeaders, oauthDisabled, oauthError } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
const input = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().regex(/^tc_code_[A-Za-z0-9_-]{43}$/),
  redirect_uri: z.string().min(1).max(2048),
  code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  resource: z.string().min(1).max(2048).optional(),
  scope: z.string().max(256).optional(),
  client_id: z.string().regex(/^tc_oauth_[A-Za-z0-9_-]{43}$/).optional(),
  client_secret: z.string().min(1).max(128).optional(),
}).strict();
export async function POST(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  const cors = oauthCorsHeaders(request);
  try {
    const body = await readFormBody(request);
    if (body.grant_type !== "authorization_code") throw new HttpError(400, "unsupported_grant_type", "Unsupported grant");
    const parsed = input.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "invalid_request", "Invalid token request");
    const resource = parsed.data.resource ?? getMcpResource();
    if (resource !== getMcpResource()) throw new HttpError(400, "invalid_target", "Invalid resource");
    const client = await authenticateOAuthClient(request, body);
    const result = await exchangeAuthorizationCode(client, { ...body, resource });
    return Response.json(result, { headers: { ...OAUTH_HEADERS, ...cors } });
  } catch (error) {
    return oauthError(error, cors);
  }
}
export async function OPTIONS(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  const cors = oauthCorsHeaders(request);
  return new Response(null, { status: 204, headers: { ...OAUTH_HEADERS, ...cors, Allow: "POST, OPTIONS" } });
}
