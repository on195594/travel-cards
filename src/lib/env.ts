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
  return { secret, email, passwordHash: required("ADMIN_PASSWORD_HASH") };
}

export function getMongoUri(): string {
  const uri = required("MONGODB_URI");
  const database = new URL(uri).pathname.slice(1);
  if (!database) throw new Error("MONGODB_URI must include a database name");
  return uri;
}
