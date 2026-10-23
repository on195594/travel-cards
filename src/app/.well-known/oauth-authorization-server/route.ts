import { authorizationServerMetadata, OAUTH_HEADERS, oauthCorsHeaders, oauthDisabled } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export async function GET(request?: Request) {
  const cors = request ? oauthCorsHeaders(request) : {};
  return oauthDisabled() ?? Response.json(authorizationServerMetadata(), { headers: { ...OAUTH_HEADERS, ...cors } });
}
export async function OPTIONS(request: Request) {
  const cors = oauthCorsHeaders(request);
  return new Response(null, { status: 204, headers: { ...OAUTH_HEADERS, ...cors, Allow: "GET, OPTIONS" } });
}
