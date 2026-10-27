import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getR2Env } from "@/lib/env";
import { HttpError } from "@/lib/http";

export const MAX_GPX_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MiB
export const MAX_ATTACHMENT_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;

export type AttachmentType = "gpx" | "kml" | "pdf" | "other";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectAttachmentType(bytes: Uint8Array, filename?: string): { type: AttachmentType; mime: string; extension: string } {
  // Check PDF magic bytes (%PDF)
  if (bytes.length >= 4 && startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return { type: "pdf", mime: "application/pdf", extension: "pdf" };
  }

  // Check text-based formats (GPX / KML)
  const headSize = Math.min(bytes.length, 4096);
  const headText = Buffer.from(bytes.slice(0, headSize)).toString("utf-8");

  if (/<gpx[\s>]/i.test(headText)) {
    return { type: "gpx", mime: "application/gpx+xml", extension: "gpx" };
  }
  if (/<kml[\s>]/i.test(headText)) {
    return { type: "kml", mime: "application/vnd.google-earth.kml+xml", extension: "kml" };
  }

  if (filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".gpx") && (headText.includes("<?xml") || headText.includes("<gpx"))) {
      return { type: "gpx", mime: "application/gpx+xml", extension: "gpx" };
    }
    if (lower.endsWith(".kml") && (headText.includes("<?xml") || headText.includes("<kml"))) {
      return { type: "kml", mime: "application/vnd.google-earth.kml+xml", extension: "kml" };
    }
  }

  throw new HttpError(400, "INVALID_ATTACHMENT", "不支持的附件格式，仅支持 GPX/KML 路线轨迹或 PDF 文档");
}

export function validateAttachment(bytes: Uint8Array, declaredType?: AttachmentType, filename?: string) {
  if (!bytes.length) throw new HttpError(400, "EMPTY_FILE", "附件文件不能为空");
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "附件文件不能超过 20 MiB");

  const detected = detectAttachmentType(bytes, filename);
  if ((detected.type === "gpx" || detected.type === "kml") && bytes.length > MAX_GPX_BYTES) {
    throw new HttpError(413, "FILE_TOO_LARGE", "轨迹文件不能超过 10 MiB");
  }

  if (declaredType && declaredType !== "other" && declaredType !== detected.type) {
    throw new HttpError(400, "INVALID_ATTACHMENT", `附件内容与声明类型 (${declaredType}) 不符`);
  }

  return detected;
}

let client: S3Client | undefined;
let clientEndpoint: string | undefined;

function r2Client(endpoint: string, accessKeyId: string, secretAccessKey: string): S3Client {
  if (!client || clientEndpoint !== endpoint) {
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      maxAttempts: 1,
    });
    clientEndpoint = endpoint;
  }
  return client;
}

export async function uploadAttachment(
  bytes: Uint8Array,
  filename: string,
  declaredType?: AttachmentType
): Promise<{ objectKey: string; publicUrl: string; size: number; type: AttachmentType }> {
  const { type, mime, extension } = validateAttachment(bytes, declaredType, filename);
  let env: ReturnType<typeof getR2Env>;
  try {
    env = getR2Env();
  } catch {
    throw new HttpError(500, "R2_CONFIGURATION_ERROR", "对象存储尚未配置");
  }

  const objectKey = `attachments/${randomUUID()}.${extension}`;
  const safeFilename = filename.trim().replace(/[\r\n"]/g, "_") || `attachment.${extension}`;

  const uploadAbort = new AbortController();
  const abortSignal = AbortSignal.any([uploadAbort.signal, AbortSignal.timeout(20_000)]);
  try {
    await r2Client(env.endpoint, env.accessKeyId, env.secretAccessKey).send(
      new PutObjectCommand({
        Bucket: env.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: mime,
        ContentLength: bytes.length,
        ContentDisposition: `attachment; filename="${encodeURIComponent(safeFilename)}"`,
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { abortSignal }
    );
  } catch {
    uploadAbort.abort();
    throw new HttpError(503, "R2_UNAVAILABLE", "附件存储暂时不可用，请重试");
  }

  return {
    objectKey,
    publicUrl: new URL(objectKey, env.publicBaseUrl).toString(),
    size: bytes.length,
    type,
  };
}
