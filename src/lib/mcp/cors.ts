import { getMcpResource } from "@/lib/mcp/access-grants";

export function mcpAllowedOrigins(): string[] {
  const selfOrigin = new URL(getMcpResource()).origin;
  const extra = (process.env.MCP_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set([selfOrigin, "https://gemini.google.com", ...extra]));
}

export function mcpCorsHeaders(request: Request, methods: string[] = ["GET", "POST", "HEAD", "OPTIONS"]): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !mcpAllowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Accept",
    "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Protocol-Version, Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
