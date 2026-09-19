import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getApiToken, getAuthEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

export function safeTokenCompare(provided: string, expected: string): boolean {
  const hashA = createHash("sha256").update(provided).digest();
  const hashB = createHash("sha256").update(expected).digest();
  return timingSafeEqual(hashA, hashB);
}

export function isValidApiToken(authHeader: string | null | undefined): boolean {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  try {
    const configured = getApiToken();
    if (!configured) return false;
    return safeTokenCompare(match[1], configured);
  } catch {
    return false;
  }
}

export function verifyApiToken(authHeader: string | null | undefined): void {
  if (authHeader === null || authHeader === undefined) throw new HttpError(401, "UNAUTHORIZED", "缺少 Authorization 请求头");
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new HttpError(401, "UNAUTHORIZED", "Authorization 格式需为 Bearer <TOKEN>");
  const configured = getApiToken();
  if (!configured) throw new HttpError(401, "UNAUTHORIZED", "服务端未配置 API Token");
  if (!safeTokenCompare(match[1], configured)) throw new HttpError(401, "UNAUTHORIZED", "无效的 API Token");
}

export function assertAdmin(session: { user?: { id?: string; email?: string | null } } | null): void {
  const configuredEmail = getAuthEnv().email;
  if (session?.user?.id !== "admin" || session.user.email?.toLowerCase() !== configuredEmail) throw new HttpError(401, "UNAUTHORIZED", "需要管理员登录");
}

export type AdminActor = {
  user: { id: string; email: string; name?: string };
  authKind: "session" | "token";
  actorLabel: string;
};

export function assertAdminOrToken(
  session: { user?: { id?: string; email?: string | null } } | null,
  authHeader?: string | null,
): AdminActor {
  if (authHeader !== undefined && authHeader !== null) {
    verifyApiToken(authHeader);
    const { email } = getAuthEnv();
    return { user: { id: "admin", email, name: "API Token" }, authKind: "token", actorLabel: "api-token" };
  }
  assertAdmin(session);
  const admin = session as { user: { id: string; email: string; name?: string } };
  return { ...admin, authKind: "session", actorLabel: admin.user.email.toLowerCase() };
}

export function logAdminAction(
  actor: AdminActor,
  action: string,
  guideId: string | null,
  beforeRevision: number | null,
  afterRevision: number | null,
  result: "success" | "failure" = "success"
): void {
  try {
    console.info("admin_action", {
      requestId: randomUUID(),
      action,
      authKind: actor.authKind,
      actorLabel: actor.actorLabel,
      guideId,
      beforeRevision,
      afterRevision,
      result,
    });
  } catch {
    // A logging failure must not turn an already committed mutation into an unknown result.
  }
}
