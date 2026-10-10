import { authorizationServerMetadata, OAUTH_HEADERS, oauthDisabled } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export async function GET() {
  return oauthDisabled() ?? Response.json(authorizationServerMetadata(), { headers: OAUTH_HEADERS });
}
