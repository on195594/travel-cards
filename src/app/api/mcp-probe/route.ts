// Public, synthetic connectivity probe: deliberately no application imports, credentials or persistence.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const maxBytes = 8192;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const tool = {
  name: "connection_check",
  description: "Check connectivity to the Travel Cards test endpoint. Returns fixed test data only; no travel content or account access.",
  inputSchema: { type: "object", additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function error(status: number, code: number, message: string, id: string | number | null = null) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers });
}
function isAllowedOrigin(origin: string, requestUrl: string): boolean {
  if (origin === "https://travel.keyi.win") return true;
  try {
    const reqOrigin = new URL(requestUrl).origin;
    if (origin === reqOrigin) return true;
    const parsed = new URL(origin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
  } catch {}
  return false;
}

function transportError(request: Request): Response | undefined {
  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin, request.url)) return error(403, -32000, "Origin not allowed");
  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !versions.includes(version)) return error(400, -32000, "Unsupported protocol version");
}

export async function POST(request: Request) {
  const rejected = transportError(request);
  if (rejected) return rejected;
  const acceptHeader = request.headers.get("accept");
  if (acceptHeader !== null && acceptHeader.trim() !== "") {
    const accepts = acceptHeader.split(",").map((part) => part.split(";", 1)[0].trim().toLowerCase());
    const acceptsJson = accepts.some((type) => type === "application/json" || type === "*/*" || type === "application/*");
    if (!acceptsJson) return error(406, -32000, "Accept must allow application/json");
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return error(415, -32000, "Content-Type must be application/json");
  }
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) return error(400, -32600, "Invalid Content-Length");
  if (length !== null && Number(length) > maxBytes) return error(413, -32000, "Request too large");

  const reader = request.body?.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0;
  let message: unknown;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.byteLength > maxBytes) {
          await reader.cancel();
          return error(413, -32000, "Request too large");
        }
        bytes.set(value, size);
        size += value.byteLength;
      }
    }
    message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    return error(400, -32700, "Invalid JSON");
  } finally {
    reader?.releaseLock();
  }
  if (!object(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(400, -32600, "Invalid request");
  }
  // Notifications are acknowledged but never execute tools or retain client data.
  if (!("id" in message)) return new Response(null, { status: 202, headers });
  const id = message.id;
  if (typeof id !== "string" && !(typeof id === "number" && Number.isSafeInteger(id))) {
    return error(400, -32600, "Invalid request id");
  }
  const params = message.params === undefined ? {} : message.params;
  if (!object(params)) return error(200, -32602, "Invalid params", id);
  let result: unknown;
  switch (message.method) {
    case "initialize":
      if (typeof params.protocolVersion !== "string" || !object(params.capabilities) || !object(params.clientInfo)
        || typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") {
        return error(200, -32602, "Invalid initialize params", id);
      }
      result = {
        protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0],
        capabilities: { tools: {} },
        serverInfo: { name: "travel-cards-connectivity-probe", version: "0.1.0" },
        instructions: "Connectivity test only. No travel data, credentials, user accounts or write operations are available.",
      };
      break;
    case "ping":
      result = {};
      break;
    case "tools/list":
      if (params.cursor !== undefined) return error(200, -32602, "Pagination is not supported", id);
      result = { tools: [tool] };
      break;
    case "tools/call":
      if (params.name !== tool.name) return error(200, -32602, "Unknown tool", id);
      if (params.arguments !== undefined && (!object(params.arguments) || Object.keys(params.arguments).length > 0)) {
        return error(200, -32602, "This test tool accepts no arguments", id);
      }
      result = {
        content: [{ type: "text", text: "Travel Cards MCP connectivity check passed. Synthetic test only; no travel data was accessed or changed." }],
        isError: false,
      };
      break;
    default:
      return error(200, -32601, "Method not found", id);
  }
  return Response.json({ jsonrpc: "2.0", id, result }, { headers });
}

// Stateless JSON-only transport: no SSE stream or session to terminate.
export function GET(request: Request) {
  return transportError(request) ?? new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
}
export const DELETE = GET;
export const PUT = GET;
export const PATCH = GET;
export const OPTIONS = GET;
export const HEAD = GET;
