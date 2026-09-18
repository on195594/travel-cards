import { describe, expect, it, vi } from "vitest";
import { HttpError, jsonError, MAX_JSON_BYTES, readJson } from "@/lib/http";

describe("stable HTTP errors", () => {
  it("maps known errors without leaking details", async () => {
    const response = jsonError(new HttpError(409, "REVISION_CONFLICT", "保留本地内容"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "REVISION_CONFLICT", message: "保留本地内容" } });
  });

  it("redacts unknown internal errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = jsonError(new Error("mongodb://user:super-secret@private/db"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("super-secret");
  });

  it("rejects malformed JSON with a stable 400", async () => {
    await expect(readJson(new Request("http://localhost:3000/api", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{" }))).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
  });

  it("rejects cross-origin, non-JSON, and oversized writes", async () => {
    await expect(readJson(new Request("http://localhost:3000/api", { method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json" }, body: "{}" }))).rejects.toMatchObject({ status: 403, code: "CROSS_ORIGIN" });
    await expect(readJson(new Request("http://localhost:3000/api", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "text/plain" }, body: "{}" }))).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(readJson(new Request("http://localhost:3000/api", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "content-length": String(MAX_JSON_BYTES + 1) }, body: "{}" }))).rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_JSON_BYTES + 1)); controller.close(); } });
    await expect(readJson(new Request("http://localhost:3000/api", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body, duplex: "half" } as RequestInit))).rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
  });

  it("allows requests without origin when authenticated with valid API Token", async () => {
    vi.stubEnv("HERMES_API_TOKEN", "test-valid-token-12345");
    const parsed = await readJson(new Request("http://localhost:3000/api", {
      method: "POST",
      headers: {
        authorization: "Bearer test-valid-token-12345",
        "content-type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    }));
    expect(parsed).toEqual({ hello: "world" });
    vi.unstubAllEnvs();
  });
});
