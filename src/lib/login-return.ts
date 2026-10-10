// Only resume the application's OAuth flow, never a client-supplied external URL.
export function getLoginReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /\s/.test(value)) return "/admin/guides";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (url.origin !== "https://internal.invalid" || url.hash) return "/admin/guides";
    if (url.pathname === "/api/oauth/authorize" && url.search) return url.pathname + url.search;
    if (url.pathname === "/admin/oauth/consent" && /^tc_intent_[A-Za-z0-9_-]{43}$/.test(url.searchParams.get("intent") ?? "") && [...url.searchParams].length === 1) return url.pathname + url.search;
  } catch {}
  return "/admin/guides";
}
