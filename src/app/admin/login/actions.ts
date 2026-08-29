import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirectTo: "/admin/guides" });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") redirect("/admin/login?error=1");
    throw error;
  }
}
