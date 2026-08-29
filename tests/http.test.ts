import { describe, expect, it, vi } from "vitest";
import { HttpError, jsonError, readJson } from "@/lib/http";

describe("stable HTTP errors", () => {
  it("maps known errors without leaking details", async () => {
    const response = jsonError(new HttpError(409, "REVISION_CONFLICT", "保留本地内容"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { code: "REVISION_CONFLICT", message: "保留本地内容" } });
  });

  it("redacts unknown internal errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = jsonError(new Error("mongodb://user:secret@private/db"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("rejects malformed JSON with a stable 400", async () => {
    await expect(readJson(new Request("http://test/api", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400, code: "INVALID_JSON" });
  });
});
