import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthEnv, getGeminiEnv, getMongoUri, getR2Env, getSiteOrigin } from "@/lib/env";

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

  it("uses the supported stable Gemini model when none is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    expect(getGeminiEnv()).toEqual({ apiKey: "test-key", model: "gemini-3.7-flash" });
  });

  it("resolves site origin from AUTH_URL or falls back to production domain", () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3100/nested/path");
    expect(getSiteOrigin()).toBe("http://localhost:3100");

    vi.stubEnv("AUTH_URL", "");
    expect(getSiteOrigin()).toBe("https://travel.keyi.win");

    vi.stubEnv("AUTH_URL", "not-a-valid-url");
    expect(getSiteOrigin()).toBe("https://travel.keyi.win");
  });
});
