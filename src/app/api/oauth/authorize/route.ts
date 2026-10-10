import { auth } from "@/auth";
import { assertAdminOrToken } from "@/lib/admin";
import { createConsentIntent, validateAuthorizationRequest } from "@/lib/mcp/oauth-authorizations";
import { oauthDisabled, oauthError, oauthRedirect } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  try {
    const url = new URL(request.url);
    await validateAuthorizationRequest(url);
    const session = await auth();
    if (!session) return oauthRedirect("/admin/login?" + new URLSearchParams({ returnTo: "/api/oauth/authorize" + url.search }));
    const actor = assertAdminOrToken(session, null);
    const intent = await createConsentIntent(actor, url);
    return oauthRedirect("/admin/oauth/consent?" + new URLSearchParams({ intent }));
  } catch (error) {
    return oauthError(error);
  }
}
