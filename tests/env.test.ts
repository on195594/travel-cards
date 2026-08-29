import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthEnv, getMongoUri, getR2Env } from "@/lib/env";

const baseline = { ...process.env };
afterEach(() => {
  process.env = { ...baseline };
  vi.unstubAllEnvs();
});

describe("environment validation", () => {
  it("rejects a short Auth secret", () => {
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => getAuthEnv()).toThrow("at least 32");
  });

  it("requires a named Mongo database", () => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    expect(() => getMongoUri()).toThrow("database name");
  });

  it("accepts only safe HTTPS R2 URLs and normalizes the public base", () => {
    vi.stubEnv("R2_ENDPOINT", "https://account.r2.cloudflarestorage.com");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://images.example.test/travel");
    vi.stubEnv("R2_BUCKET", "travel-cards");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    expect(getR2Env()).toMatchObject({ publicBaseUrl: "https://images.example.test/travel/" });
    vi.stubEnv("R2_ENDPOINT", "http://account.r2.cloudflarestorage.com");
    expect(() => getR2Env()).toThrow("safe HTTPS URL");
  });
});
