import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertAdmin, assertAdminOrToken } from "@/lib/admin";
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

async function getHeaderAuthorization(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("authorization");
  } catch {
    return null;
  }
}

export async function requireAdmin(request?: Request) {
  const authHeader = request ? request.headers.get("authorization") : await getHeaderAuthorization();
  if (authHeader !== null) {
    return assertAdminOrToken(null, authHeader);
  }
  const session = await auth();
  return assertAdminOrToken(session, null);
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
