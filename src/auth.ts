import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { assertAdmin, assertAdminOrToken } from "@/lib/admin";
import { assertCapability, type ApiCapability } from "@/lib/capabilities";
import { getAuthEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/password";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const { email, passwordHash } = getAuthEnv();
        const suppliedEmail = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (suppliedEmail !== email || !(await verifyPassword(password, passwordHash))) return null;
        return { id: "admin", email, name: "管理员" };
      },
    }),
  ],
  callbacks: {
    session({ session }) {
      if (session.user) session.user.id = "admin";
      return session;
    },
  },
});

export async function requireCapability(request: Request, capability: ApiCapability) {
  // Admin REST accepts Session/API Token; restricted OAuth tokens are verified only at /mcp.
  const authHeader = request.headers.get("authorization");
  const session = authHeader === null ? await auth() : null;
  const actor = assertAdminOrToken(session, authHeader);
  assertCapability(actor, capability);
  return actor;
}

export async function requireAdminPage() {
  const session = await auth();
  try {
    assertAdmin(session);
  } catch {
    redirect("/admin/login");
  }
  return session;
}
