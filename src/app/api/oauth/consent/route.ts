import { z } from "zod";
import { HttpError, readFormBody } from "@/lib/http";
import { decideConsent } from "@/lib/mcp/oauth-authorizations";
import { oauthAdmin, oauthDisabled, oauthError, oauthRedirect } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
const input = z.object({ intent: z.string().regex(/^tc_intent_[A-Za-z0-9_-]{43}$/), decision: z.enum(["approve", "deny"]) }).strict();
export async function POST(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  try {
    const actor = await oauthAdmin(request);
    const body = input.safeParse(await readFormBody(request));
    if (!body.success) throw new HttpError(400, "invalid_request", "Invalid consent");
    return oauthRedirect(await decideConsent(actor, body.data.intent, body.data.decision));
  } catch (error) {
    if (error instanceof HttpError && error.status === 400 && request.headers.get("accept")?.includes("text/html")) return oauthRedirect("/admin/oauth/consent");
    return oauthError(error);
  }
}
