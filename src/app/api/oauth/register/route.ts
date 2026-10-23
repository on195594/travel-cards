import { HttpError, PUBLIC_NO_STORE_HEADERS, readJsonBody } from "@/lib/http";
import { MCP_REGISTRATION_MAX_BYTES, registerMcpClient, takeMcpRegistrationQuota } from "@/lib/mcp/oauth-clients";
import { mcpCorsHeaders } from "@/lib/mcp/cors";

export const runtime = "nodejs";
const headers = { ...PUBLIC_NO_STORE_HEADERS, Pragma: "no-cache" };

export async function POST(request: Request): Promise<Response> {
  if (process.env.MCP_OAUTH_ENABLED !== "true") {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const cors = mcpCorsHeaders(request, ["POST", "OPTIONS"]);
  try {
    // DCR is intentionally unauthenticated; every attempt consumes quota before parsing.
    const quota = await takeMcpRegistrationQuota();
    if (!quota.allowed) {
      return Response.json({ error: "rate_limit_exceeded" }, {
        status: 429, headers: { ...headers, ...cors, "Retry-After": String(quota.retryAfter) },
      });
    }
    const metadata = await readJsonBody(request, MCP_REGISTRATION_MAX_BYTES);
    return Response.json(await registerMcpClient(metadata), { status: 201, headers: { ...headers, ...cors } });
  } catch (error) {
    if (error instanceof HttpError) {
      const code = error.code === "invalid_redirect_uri" ? error.code : "invalid_client_metadata";
      return Response.json({ error: code, error_description: "Invalid registration request" }, { status: error.status, headers: { ...headers, ...cors } });
    }
    console.error("OAuth registration failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "server_error" }, { status: 500, headers: { ...headers, ...cors } });
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  if (process.env.MCP_OAUTH_ENABLED !== "true") {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  const cors = mcpCorsHeaders(request, ["POST", "OPTIONS"]);
  return new Response(null, { status: 204, headers: { ...headers, ...cors, Allow: "POST, OPTIONS" } });
}
