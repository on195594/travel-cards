import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import {
  detectAttachmentType,
  validateAttachment,
  uploadAttachment,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/storage/attachments";

const gpxBytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>Trail</name></trk></gpx>`);
const kmlBytes = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark></Placemark></kml>`);
const pdfBytes = Buffer.from(`%PDF-1.4\n%test\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF`);

describe("Attachment validation and type detection", () => {
  it("detects and validates GPX, KML and PDF files", () => {
    expect(detectAttachmentType(gpxBytes)).toEqual({
      type: "gpx",
      mime: "application/gpx+xml",
      extension: "gpx",
    });
    expect(detectAttachmentType(kmlBytes)).toEqual({
      type: "kml",
      mime: "application/vnd.google-earth.kml+xml",
      extension: "kml",
    });
    expect(detectAttachmentType(pdfBytes)).toEqual({
      type: "pdf",
      mime: "application/pdf",
      extension: "pdf",
    });
  });

  it("validates declared type matches detected type", () => {
    expect(() => validateAttachment(pdfBytes, "pdf")).not.toThrow();
    expect(() => validateAttachment(gpxBytes, "gpx")).not.toThrow();
    expect(() => validateAttachment(pdfBytes, "gpx")).toThrow(
      expect.objectContaining({ status: 400, code: "INVALID_ATTACHMENT" })
    );
  });

  it("rejects empty, unsupported, and oversized files", () => {
    expect(() => validateAttachment(new Uint8Array())).toThrow(
      expect.objectContaining({ status: 400, code: "EMPTY_FILE" })
    );
    expect(() => validateAttachment(Buffer.from("random unformatted text"))).toThrow(
      expect.objectContaining({ status: 400, code: "INVALID_ATTACHMENT" })
    );
    expect(() => validateAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES + 1))).toThrow(
      expect.objectContaining({ status: 413, code: "FILE_TOO_LARGE" })
    );
  });
});

describe("Attachment upload to R2", () => {
  beforeEach(() => {
    vi.stubEnv("R2_ENDPOINT", "https://r2.example.test");
    vi.stubEnv("R2_BUCKET", "test-bucket");
    vi.stubEnv("R2_ACCESS_KEY_ID", "fake-key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "fake-secret");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://images.example.test/media/");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uploads attachment with Content-Disposition attachment header and immutable cache", async () => {
    const send = vi.fn().mockResolvedValue({});
    vi.spyOn(S3Client.prototype, "send").mockImplementation(send);

    const result = await uploadAttachment(pdfBytes, "攻略路线手册.pdf", "pdf");
    expect(result.objectKey).toMatch(/^attachments\/[0-9a-f-]{36}\.pdf$/);
    expect(result.publicUrl).toBe(`https://images.example.test/media/${result.objectKey}`);
    expect(result.type).toBe("pdf");
    expect(result.size).toBe(pdfBytes.length);

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: "test-bucket",
      Key: result.objectKey,
      ContentType: "application/pdf",
      CacheControl: "public, max-age=31536000, immutable",
    });
    expect(command.input.ContentDisposition).toContain("attachment; filename=");
  });

  it("fails with 500 when R2 environment is missing", async () => {
    vi.unstubAllEnvs();
    await expect(uploadAttachment(gpxBytes, "track.gpx", "gpx")).rejects.toMatchObject({
      status: 500,
      code: "R2_CONFIGURATION_ERROR",
    });
  });
});
