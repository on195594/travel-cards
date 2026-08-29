import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock("@/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/storage/r2", () => ({
  MAX_MULTIPART_BYTES: 10 * 1024 * 1024 + 64 * 1024,
  uploadImage: mocks.uploadImage,
}));

import { POST } from "@/app/api/uploads/route";

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" } });
    mocks.uploadImage.mockResolvedValue({ objectKey: "guides/test.png", publicUrl: "https://img.example.test/guides/test.png" });
  });

  it("authorizes before consuming any body bytes", async () => {
    let pulls = 0;
    mocks.requireAdmin.mockRejectedValue(new HttpError(401, "UNAUTHORIZED", "需要管理员登录"));
    const body = new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(Uint8Array.of(1)); controller.close(); } });
    const request = new Request("http://localhost/api/uploads", { method: "POST", body, duplex: "half" } as RequestInit);
    await Promise.resolve();
    const pullsBeforeRoute = pulls;
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(pulls).toBe(pullsBeforeRoute);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized envelope without reading the body", async () => {
    let pulls = 0;
    const body = new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(Uint8Array.of(1)); controller.close(); } });
    const request = new Request("http://localhost/api/uploads", {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(10 * 1024 * 1024 + 64 * 1024 + 1),
      },
    } as RequestInit);
    await Promise.resolve();
    const pullsBeforeRoute = pulls;
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(pulls).toBe(pullsBeforeRoute);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("accepts exactly one file and returns only object metadata", async () => {
    const form = new FormData();
    form.append("file", new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "ignored.png", { type: "image/png" }));
    const source = new Request("http://localhost/api/uploads", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form });
    const request = new Request(source.url, { method: "POST", headers: source.headers, body: source.body, duplex: "half" } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ objectKey: "guides/test.png", publicUrl: "https://img.example.test/guides/test.png" });
    expect(mocks.uploadImage).toHaveBeenCalledOnce();
    expect(mocks.uploadImage.mock.calls[0][1]).toBe("image/png");
  });

  it("rejects extra form fields", async () => {
    const form = new FormData();
    form.append("file", new File([Uint8Array.from([0xff, 0xd8, 0xff])], "ignored.jpg", { type: "image/jpeg" }));
    form.append("path", "client/chosen.jpg");
    const source = new Request("http://localhost/api/uploads", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form });
    const request = new Request(source.url, { method: "POST", headers: source.headers, body: source.body, duplex: "half" } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });
});
