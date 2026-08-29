import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthEnv, getMongoUri } from "@/lib/env";

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
});
