import { z } from "zod";
import { logAdminAction } from "@/lib/admin";
import { HttpError, readFormBody } from "@/lib/http";
import { revokeMcpClient } from "@/lib/mcp/oauth-clients";
import { oauthAdmin, oauthDisabled, oauthError, oauthRedirect } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
const input = z.object({ client_id: z.string().regex(/^tc_oauth_[A-Za-z0-9_-]{43}$/) }).strict();
export async function POST(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  try {
    const actor = await oauthAdmin(request);
    const parsed = input.safeParse(await readFormBody(request));
    if (!parsed.success) throw new HttpError(400, "invalid_request", "Invalid client");
    await revokeMcpClient(actor, parsed.data.client_id);
    logAdminAction(actor, "mcp.client.revoke", null, null, null);
    return oauthRedirect("/admin/oauth?revoked=1");
  } catch (error) {
    return oauthError(error);
  }
}
