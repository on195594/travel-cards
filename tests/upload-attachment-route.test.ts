import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock("@/auth", () => ({ requireCapability: mocks.requireCapability }));
vi.mock("@/lib/storage/attachments", () => ({
  MAX_ATTACHMENT_MULTIPART_BYTES: 20 * 1024 * 1024 + 64 * 1024,
  uploadAttachment: mocks.uploadAttachment,
}));

import { POST } from "@/app/api/attachments/route";

describe("POST /api/attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCapability.mockResolvedValue({ user: { id: "admin" } });
    mocks.uploadAttachment.mockResolvedValue({
      objectKey: "attachments/test-track.gpx",
      publicUrl: "https://img.example.test/attachments/test-track.gpx",
      size: 1024,
      type: "gpx",
    });
  });

  it("checks attachment.upload capability before body processing", async () => {
    mocks.requireCapability.mockRejectedValue(new HttpError(403, "FORBIDDEN", "无权上传附件"));
    const request = new Request("http://localhost/api/attachments", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      duplex: "half",
    } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mocks.uploadAttachment).not.toHaveBeenCalled();
  });

  it("accepts valid multipart upload and returns attachment object", async () => {
    const form = new FormData();
    form.append("file", new File([Buffer.from("dummy-gpx-content")], "trail.gpx", { type: "application/gpx+xml" }));
    form.append("name", "自定义航迹.gpx");
    form.append("description", "徒步路线航迹");

    const request = new Request("http://localhost:3000/api/attachments", {
      method: "POST",
      body: form,
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.attachment).toMatchObject({
      name: "自定义航迹.gpx",
      type: "gpx",
      publicUrl: "https://img.example.test/attachments/test-track.gpx",
      description: "徒步路线航迹",
    });
    expect(data.attachment.id).toBeDefined();
  });

  it("rejects attachment name exceeding 200 characters", async () => {
    const form = new FormData();
    form.append("file", new File([Buffer.from("dummy-gpx-content")], "trail.gpx", { type: "application/gpx+xml" }));
    form.append("name", "a".repeat(201));

    const request = new Request("http://localhost:3000/api/attachments", {
      method: "POST",
      body: form,
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe("INVALID_ATTACHMENT_NAME");
    expect(mocks.uploadAttachment).not.toHaveBeenCalled();
  });

  it("rejects description exceeding 1000 characters", async () => {
    const form = new FormData();
    form.append("file", new File([Buffer.from("dummy-gpx-content")], "trail.gpx", { type: "application/gpx+xml" }));
    form.append("name", "trail.gpx");
    form.append("description", "d".repeat(1001));

    const request = new Request("http://localhost:3000/api/attachments", {
      method: "POST",
      body: form,
      headers: {
        origin: "http://localhost:3000",
      },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.code).toBe("INVALID_ATTACHMENT_DESCRIPTION");
    expect(mocks.uploadAttachment).not.toHaveBeenCalled();
  });
});
