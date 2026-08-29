import { getAuthEnv } from "@/lib/env";
import { HttpError } from "@/lib/http";

export function assertAdmin(session: { user?: { id?: string; email?: string | null } } | null): void {
  const configuredEmail = getAuthEnv().email;
  if (session?.user?.id !== "admin" || session.user.email?.toLowerCase() !== configuredEmail) throw new HttpError(401, "UNAUTHORIZED", "需要管理员登录");
}
