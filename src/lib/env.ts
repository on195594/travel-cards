function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getAuthEnv() {
  const secret = required("AUTH_SECRET");
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  const email = required("ADMIN_EMAIL").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("ADMIN_EMAIL is invalid");
  const authUrl = new URL(required("AUTH_URL"));
  if (!["http:", "https:"].includes(authUrl.protocol) || authUrl.username || authUrl.password || authUrl.search || authUrl.hash || authUrl.pathname !== "/") {
    throw new Error("AUTH_URL must be an HTTP(S) origin");
  }
  return { secret, email, passwordHash: required("ADMIN_PASSWORD_HASH"), authOrigin: authUrl.origin };
}

export function getApiToken(): string | null {
  const token = (process.env.HERMES_API_TOKEN || process.env.API_TOKEN)?.trim();
  if (!token) return null;
  if (token.length < 16) throw new Error("HERMES_API_TOKEN must be at least 16 characters");
  return token;
}

export function getSiteOrigin(): string {
  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) {
    try {
      return new URL(authUrl).origin;
    } catch {}
  }
  return "https://travel.keyi.win";
}

export function getMongoUri(): string {
  const uri = required("MONGODB_URI");
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB URL");
  }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol) || !parsed.pathname.slice(1)) {
    throw new Error("MONGODB_URI must be a MongoDB URL with a database name");
  }
  return uri;
}

export function getGeminiEnv() {
  return { apiKey: required("GEMINI_API_KEY"), model: process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash" };
}

function httpsUrl(name: string, allowPath: boolean): URL {
  const value = new URL(required(name));
  if (value.protocol !== "https:" || value.username || value.password || value.search || value.hash || (!allowPath && value.pathname !== "/")) {
    throw new Error(`${name} must be a safe HTTPS URL`);
  }
  return value;
}

export function getR2Env() {
  const endpoint = httpsUrl("R2_ENDPOINT", false).toString().replace(/\/$/, "");
  const publicBase = httpsUrl("R2_PUBLIC_BASE_URL", true);
  if (!publicBase.pathname.endsWith("/")) publicBase.pathname += "/";
  return {
    endpoint,
    bucket: required("R2_BUCKET"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    publicBaseUrl: publicBase.toString(),
  };
}
