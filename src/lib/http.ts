import { ZodError } from "zod";
import { isValidApiToken } from "@/lib/admin";
import { getAuthEnv } from "@/lib/env";

export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const PUBLIC_NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
export const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function boundedText(request: Request): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "REQUEST_TOO_LARGE", "请求体不能超过 2 MiB");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求体必须是有效 JSON");
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    const retryable = "retryable" in error && typeof error.retryable === "boolean" ? { retryable: error.retryable } : {};
    return Response.json({ error: { code: error.code, message: error.message, ...retryable } }, { status: error.status, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (error instanceof ZodError) return Response.json({ error: { code: "VALIDATION_ERROR", message: "请求数据无效", issues: error.issues } }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  if (typeof error === "object" && error && "code" in error && error.code === 11000) return Response.json({ error: { code: "SLUG_CONFLICT", message: "该 slug 已被使用" } }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
}

export async function readJson(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "请求体必须使用 application/json");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new HttpError(400, "INVALID_CONTENT_LENGTH", "Content-Length 无效");
    if (Number(contentLength) > MAX_JSON_BYTES) throw new HttpError(413, "REQUEST_TOO_LARGE", "请求体不能超过 2 MiB");
  }
  const body = await boundedText(request);
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求体必须是有效 JSON");
  }
}

export function assertSameOrigin(request: Request): void {
  if (isValidApiToken(request.headers.get("authorization"))) return;
  if (request.headers.get("origin") !== getAuthEnv().authOrigin) throw new HttpError(403, "CROSS_ORIGIN", "拒绝跨来源写请求");
}
