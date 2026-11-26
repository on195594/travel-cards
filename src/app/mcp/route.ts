import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { AI_GUIDE_SCOPES, hasCapability, type AiGuideScope, type ApiActor } from "@/lib/capabilities";
import { HttpError, MAX_JSON_BYTES, readJsonBody } from "@/lib/http";
import { authenticateMcpOAuthAccessToken, getMcpResource } from "@/lib/mcp/access-grants";
import { mcpAllowedOrigins, mcpCorsHeaders } from "@/lib/mcp/cors";
import { guideToolScopes, MCP_INSTRUCTIONS, MCP_SERVER_INFO, registerGuideTools } from "@/lib/mcp/guide-tools";
import { OAUTH_HEADERS, oauthDisabled } from "@/lib/mcp/oauth-http";
import { consumeMcpToolCall } from "@/lib/mcp/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseHeaders = { ...OAUTH_HEADERS, "X-Content-Type-Options": "nosniff" };
const abortDispatch = Symbol("mcp-short-circuit");

interface McpRequestState {
  actor: Extract<ApiActor, { authKind: "restricted-ai" }>;
  parsedBody: unknown;
  cors: Record<string, string>;
  override?: Response;
}

const requestStates = new WeakMap<Request, McpRequestState>();

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number,
  cors: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: { ...baseHeaders, ...cors, ...extraHeaders } },
  );
}

function authChallenge(status: 401 | 403, scopes: readonly AiGuideScope[] = AI_GUIDE_SCOPES, cors: Record<string, string> = {}): Response {
  const origin = new URL(getMcpResource()).origin;
  const error = status === 401 ? "invalid_token" : "insufficient_scope";
  return Response.json(
    { error },
    {
      status,
      headers: {
        ...baseHeaders,
        ...cors,
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", error="${error}", scope="${scopes.join(" ")}"`,
      },
    },
  );
}

function withMcpHeaders(response: Response, cors: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries({ ...baseHeaders, ...cors })) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function acceptsJson(accept: string | null): boolean {
  if (accept === null) return true;
  let specificity = -1;
  let quality = 0;
  for (const range of accept.toLowerCase().split(",")) {
    const [type, ...params] = range.split(";").map((part) => part.trim());
    const rank = ["*/*", "application/*", "application/json"].indexOf(type);
    if (rank < 0) continue;
    const weight = params.find((param) => /^q\s*=/.test(param))?.split("=", 2)[1].trim();
    const q = weight === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(weight) ? Number(weight) : 0;
    // A specific q=0 must override an acceptable wildcard (RFC 9110 §12.5.1).
    if (rank > specificity) {
      specificity = rank;
      quality = q;
    } else if (rank === specificity) {
      quality = Math.max(quality, q);
    }
  }
  return quality > 0;
}

async function authenticate(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && !mcpAllowedOrigins().includes(origin)) {
    throw new HttpError(403, "CROSS_ORIGIN", "拒绝跨来源 MCP 请求");
  }
  return authenticateMcpOAuthAccessToken(request.headers.get("authorization"), getMcpResource());
}

const mcpHandler = createMcpHandler(
  async ({ requestInfo }) => {
    const state = requestInfo ? requestStates.get(requestInfo) : undefined;
    if (!state) throw new Error("Missing authenticated MCP request context");

    const msg = typeof state.parsedBody === "object" && state.parsedBody !== null && !Array.isArray(state.parsedBody)
      ? (state.parsedBody as { id?: unknown; method?: unknown; params?: unknown })
      : null;
    const reqId = msg && (typeof msg.id === "string" || typeof msg.id === "number") ? msg.id : null;

    if (msg && reqId !== null && msg.method === "subscriptions/listen") {
      state.override = jsonRpcError(reqId, -32601, "Method not found", 404, state.cors);
      throw abortDispatch;
    }

    if (
      msg &&
      reqId !== null &&
      msg.method === "tools/call" &&
      typeof msg.params === "object" &&
      msg.params !== null &&
      !Array.isArray(msg.params) &&
      "name" in msg.params &&
      typeof msg.params.name === "string"
    ) {
      const rawArgs = "arguments" in msg.params ? msg.params.arguments : undefined;
      const validArgsShape = rawArgs === undefined || (typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs));
      const scopes = guideToolScopes(msg.params.name, rawArgs);
      if (scopes !== null) {
        if (scopes.some((scope) => !hasCapability(state.actor, scope))) {
          state.override = authChallenge(403, scopes, state.cors);
          throw abortDispatch;
        }
        if (validArgsShape) {
          let retryAfter: number;
          try {
            retryAfter = await consumeMcpToolCall(state.actor.actorLabel);
          } catch (error) {
            console.error("MCP rate limit failed", error instanceof Error ? error.name : "UnknownError");
            state.override = jsonRpcError(reqId, -32603, "Internal error", 500, state.cors);
            throw abortDispatch;
          }
          if (retryAfter > 0) {
            state.override = jsonRpcError(reqId, 429, "Tool call rate limit exceeded", 429, state.cors, {
              "Retry-After": String(retryAfter),
            });
            throw abortDispatch;
          }
        }
      }
    }

    const server = new McpServer(MCP_SERVER_INFO, {
      capabilities: { tools: { listChanged: false } },
      instructions: MCP_INSTRUCTIONS,
      cacheHints: {
        "server/discover": { ttlMs: 0, cacheScope: "private" },
        "tools/list": { ttlMs: 0, cacheScope: "private" },
      },
    });
    registerGuideTools(server, state.actor);
    return server;
  },
  {
    legacy: "reject",
    responseMode: "json",
    maxSubscriptions: 0,
    keepAliveMs: 0,
    maxRequestBodySize: MAX_JSON_BYTES,
  },
);

export async function POST(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  const cors = mcpCorsHeaders(request);

  let actor: Extract<ApiActor, { authKind: "restricted-ai" }>;
  try {
    actor = await authenticate(request);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return authChallenge(401, AI_GUIDE_SCOPES, cors);
    if (error instanceof HttpError && error.code === "CROSS_ORIGIN") return jsonRpcError(null, -32600, "Forbidden Origin", 403, cors);
    console.error("MCP authentication failed", error instanceof Error ? error.name : "UnknownError");
    return jsonRpcError(null, -32603, "Internal error", 500, cors);
  }

  if (!acceptsJson(request.headers.get("accept"))) {
    return jsonRpcError(null, -32600, "JSON responses must be accepted", 406, cors);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonBody(request);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonRpcError(null, error.code === "INVALID_JSON" ? -32700 : -32600, "Invalid request body", error.status, cors);
    }
    return jsonRpcError(null, -32603, "Internal error", 500, cors);
  }

  const state: McpRequestState = { actor, parsedBody, cors };
  requestStates.set(request, state);
  try {
    const response = await mcpHandler.fetch(request, {
      parsedBody,
      authInfo: {
        token: "verified",
        clientId: actor.actorLabel,
        scopes: [...actor.scopes],
        resource: new URL(getMcpResource()),
      },
    });
    return state.override ?? withMcpHeaders(response, cors);
  } finally {
    requestStates.delete(request);
  }
}

async function unsupportedMethod(request: Request) {
  const disabled = oauthDisabled();
  if (disabled) return disabled;
  const cors = mcpCorsHeaders(request);
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (origin !== null && !mcpAllowedOrigins().includes(origin)) {
      return jsonRpcError(null, -32600, "Forbidden Origin", 403, {});
    }
    return new Response(null, { status: 204, headers: { ...baseHeaders, ...cors, Allow: "POST, OPTIONS" } });
  }
  try {
    await authenticate(request);
    return new Response(null, { status: 405, headers: { ...baseHeaders, ...cors, Allow: "POST" } });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return authChallenge(401, AI_GUIDE_SCOPES, cors);
    if (error instanceof HttpError && error.code === "CROSS_ORIGIN") return jsonRpcError(null, -32600, "Forbidden Origin", 403, {});
    return jsonRpcError(null, -32603, "Internal error", 500, cors);
  }
}

export const GET = unsupportedMethod;
export const HEAD = unsupportedMethod;
export const DELETE = unsupportedMethod;
export const OPTIONS = unsupportedMethod;
