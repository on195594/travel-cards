import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  createImageObjectKey,
  detectImageMime,
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
});
