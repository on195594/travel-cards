import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getLoginReturnTo } from "@/lib/login-return";

export async function login(formData: FormData) {
  "use server";
  const returnTo = getLoginReturnTo(formData.get("returnTo"));
  try {
    await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirectTo: returnTo });
  } catch (error) {
    if (error instanceof AuthError && error.type === "CredentialsSignin") redirect("/admin/login?" + new URLSearchParams({ error: "1", returnTo }));
    throw error;
  }
}
