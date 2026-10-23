import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  MAX_FILE_BYTES,
  createImageObjectKey,
  detectImageMime,
  uploadImage,
  validateImage,
} from "@/lib/storage/r2";

const signatures = {
  "image/jpeg": Uint8Array.from([0xff, 0xd8, 0xff, 0x00]),
  "image/png": Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]),
} as const;

describe("R2 image validation", () => {
  it.each(Object.entries(signatures))("detects and accepts %s", (mime, bytes) => {
    expect(detectImageMime(bytes)).toBe(mime);
    expect(validateImage(bytes, mime)).toEqual({ mime, extension: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] });
  });

  it("rejects empty, mismatched, truncated, and oversized images", () => {
    expect(() => validateImage(new Uint8Array(), "image/png")).toThrow();
    expect(() => validateImage(signatures["image/png"], "image/jpeg")).toThrow();
    expect(() => validateImage(Uint8Array.from([0x89, 0x50]), "image/png")).toThrow();
    expect(() => validateImage(new Uint8Array(MAX_FILE_BYTES + 1), "image/png")).toThrow();
  });

  it("derives a path-safe key from detected type", () => {
    expect(createImageObjectKey("jpg")).toMatch(/^guides\/[0-9a-f-]{36}\.jpg$/);
    expect(createImageObjectKey("png")).toMatch(/^guides\/[0-9a-f-]{36}\.png$/);
    expect(createImageObjectKey("webp")).toMatch(/^guides\/[0-9a-f-]{36}\.webp$/);
  });

  it("reports missing R2 configuration without attempting a fake upload", async () => {
    await expect(uploadImage(signatures["image/png"], "image/png")).rejects.toMatchObject({ status: 500, code: "R2_CONFIGURATION_ERROR" });
  });
});

describe("R2 upload with real image processing and fake storage transport", () => {
  beforeEach(() => {
    vi.stubEnv("R2_ENDPOINT", "https://r2.example.test");
    vi.stubEnv("R2_BUCKET", "test-bucket");
    vi.stubEnv("R2_ACCESS_KEY_ID", "fake-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "fake-secret");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://images.example.test/media/");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("keeps the original, uploads bounded responsive WebP sizes and marks UUID objects immutable", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const bytes = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#376653" } }).jpeg().toBuffer();
    const uploaded = await uploadImage(bytes, "image/jpeg");
    expect(uploaded.publicUrl).toBe(`https://images.example.test/media/${uploaded.objectKey}`);
    expect(uploaded.variants!.map((variant) => variant.width)).toEqual([480, 960, 1600]);
    expect(send).toHaveBeenCalledTimes(4);
    const commands = send.mock.calls.map(([command]) => command as { input: { Key: string; Body: Uint8Array; CacheControl: string; ContentType: string; ContentLength: number } });
    expect(commands[0].input.Body).toEqual(bytes);
    for (const { input } of commands) {
      expect(input.CacheControl).toBe("public, max-age=31536000, immutable");
      expect(input.ContentLength).toBe(input.Body.length);
    }
    for (const variant of uploaded.variants!) {
      const input = commands.find(({ input }) => input.Key === variant.objectKey)!.input;
      const metadata = await sharp(input.Body).metadata();
      expect(metadata).toMatchObject({ width: variant.width, height: variant.height, format: "webp" });
      expect(input.Body.length).toBeLessThan(bytes.length);
      expect(variant.height).toBeLessThanOrEqual(1600);
      expect(variant.publicUrl).toBe(`https://images.example.test/media/${variant.objectKey}`);
    }
  });

  it("deduplicates small sizes without enlarging and auto-orients display variants", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const small = await sharp({ create: { width: 12, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    expect((await uploadImage(small, "image/png")).variants).toMatchObject([{ width: 12, height: 10 }]);
    expect(send).toHaveBeenCalledTimes(2);
    const rotated = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await uploadImage(rotated, "image/jpeg");
    expect(result.variants).toMatchObject([{ width: 480, height: 720 }, { width: 800, height: 1200 }]);
  });

  it("rejects undecodable images and excessive pixel counts before writing storage", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    await expect(uploadImage(signatures["image/png"], "image/png")).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE" });
    const oversized = await sharp({ create: { width: 6401, height: 6400, channels: 3, background: "white" } }).png().toBuffer();
    expect(oversized.length).toBeLessThan(MAX_FILE_BYTES);
    await expect(uploadImage(oversized, "image/png")).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports storage failure without leaking provider details or pretending partial uploads succeeded", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(new Error("private-provider-details"));
    const bytes = await sharp({ create: { width: 12, height: 10, channels: 3, background: "white" } }).png().toBuffer();
    await expect(uploadImage(bytes, "image/png")).rejects.toMatchObject({ status: 503, code: "R2_UNAVAILABLE", message: "图片存储暂时不可用，请重试" });
  });
});
