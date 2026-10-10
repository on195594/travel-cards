import { OAUTH_HEADERS, oauthDisabled, protectedResourceMetadata } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export async function GET() {
  return oauthDisabled() ?? Response.json(protectedResourceMetadata(), { headers: OAUTH_HEADERS });
}
