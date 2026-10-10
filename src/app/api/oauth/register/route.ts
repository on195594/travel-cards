import { HttpError, PUBLIC_NO_STORE_HEADERS, readJsonBody } from "@/lib/http";
import { MCP_REGISTRATION_MAX_BYTES, registerMcpClient, takeMcpRegistrationQuota } from "@/lib/mcp/oauth-clients";

export const runtime = "nodejs";
const headers = { ...PUBLIC_NO_STORE_HEADERS, Pragma: "no-cache" };

export async function POST(request: Request): Promise<Response> {
  if (process.env.MCP_OAUTH_ENABLED !== "true") {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  try {
    // DCR is intentionally unauthenticated; every attempt consumes quota before parsing.
    const quota = await takeMcpRegistrationQuota();
    if (!quota.allowed) {
      return Response.json({ error: "rate_limit_exceeded" }, {
        status: 429, headers: { ...headers, "Retry-After": String(quota.retryAfter) },
      });
    }
    const metadata = await readJsonBody(request, MCP_REGISTRATION_MAX_BYTES);
    return Response.json(await registerMcpClient(metadata), { status: 201, headers });
  } catch (error) {
    if (error instanceof HttpError) {
      const code = error.code === "invalid_redirect_uri" ? error.code : "invalid_client_metadata";
      return Response.json({ error: code, error_description: "Invalid registration request" }, { status: error.status, headers });
    }
    console.error("OAuth registration failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "server_error" }, { status: 500, headers });
  }
}
