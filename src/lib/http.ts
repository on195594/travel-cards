import { ZodError } from "zod";
import { getAuthEnv } from "@/lib/env";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    const retryable = "retryable" in error && typeof error.retryable === "boolean" ? { retryable: error.retryable } : {};
    return Response.json({ error: { code: error.code, message: error.message, ...retryable } }, { status: error.status });
  }
  if (error instanceof ZodError) return Response.json({ error: { code: "VALIDATION_ERROR", message: "请求数据无效", issues: error.issues } }, { status: 400 });
  if (typeof error === "object" && error && "code" in error && error.code === 11000) return Response.json({ error: { code: "SLUG_CONFLICT", message: "该 slug 已被使用" } }, { status: 409 });
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "请求体必须使用 application/json");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "请求体必须是有效 JSON");
  }
}

export function assertSameOrigin(request: Request): void {
  if (request.headers.get("origin") !== getAuthEnv().authOrigin) throw new HttpError(403, "CROSS_ORIGIN", "拒绝跨来源写请求");
}
