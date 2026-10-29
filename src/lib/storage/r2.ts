import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { getR2Env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { ImageUpload } from "@/lib/guides/schema";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 64 * 1024;

type ImageMime = "image/jpeg" | "image/png" | "image/webp";
type ImageExtension = "jpg" | "png" | "webp";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  const webpChunk = String.fromCharCode(...bytes.slice(12, 16));
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) && ["VP8 ", "VP8L", "VP8X"].includes(webpChunk)) return "image/webp";
  return null;
}

export function validateImage(bytes: Uint8Array, declaredMime: string): { mime: ImageMime; extension: ImageExtension } {
  if (!bytes.length) throw new HttpError(400, "EMPTY_FILE", "图片文件不能为空");
  if (bytes.length > MAX_FILE_BYTES) throw new HttpError(413, "FILE_TOO_LARGE", "图片文件不能超过 10 MiB");
  const detected = detectImageMime(bytes);
  if (!detected || detected !== declaredMime) throw new HttpError(400, "INVALID_IMAGE", "图片类型或文件签名无效");
  return { mime: detected, extension: detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : "webp" };
}

export function createImageObjectKey(extension: ImageExtension): string {
  return `guides/${randomUUID()}.${extension}`;
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

export async function uploadImage(bytes: Uint8Array, declaredMime: string): Promise<ImageUpload> {
  const { mime, extension } = validateImage(bytes, declaredMime);
  let env: ReturnType<typeof getR2Env>;
  try {
    env = getR2Env();
  } catch {
    throw new HttpError(500, "R2_CONFIGURATION_ERROR", "图片存储尚未配置");
  }
  const objectKey = createImageObjectKey(extension);
  const variants: NonNullable<ImageUpload["variants"]> = [];
  const objects = [{ objectKey, bytes, mime: mime as string }];
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate();
    for (const width of [480, 960, 1600]) {
      const { data, info } = await image.clone()
        .resize({ width, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
      if (variants.some((variant) => variant.width === info.width)) break;
      const key = objectKey.replace(/\.[^.]+$/, `-${info.width}w.webp`);
      variants.push({ objectKey: key, publicUrl: new URL(key, env.publicBaseUrl).toString(), width: info.width, height: info.height });
      objects.push({ objectKey: key, bytes: data, mime: "image/webp" });
      // Once bounded by the source size or max height, wider requests produce the same variant.
      if (info.width < width || info.height === 1600) break;
    }
  } catch {
    throw new HttpError(400, "INVALID_IMAGE", "图片无法处理，请使用可解码且不超过 4000 万像素的图片");
  }
  const uploadAbort = new AbortController();
  const abortSignal = AbortSignal.any([uploadAbort.signal, AbortSignal.timeout(15_000)]);
  try {
    await Promise.all(objects.map((object) => r2Client(env.endpoint, env.accessKeyId, env.secretAccessKey).send(new PutObjectCommand({
      Bucket: env.bucket,
      Key: object.objectKey,
      Body: object.bytes,
      ContentType: object.mime,
      ContentLength: object.bytes.length,
      CacheControl: "public, max-age=31536000, immutable",
    }), { abortSignal })));
  } catch {
    uploadAbort.abort();
    throw new HttpError(503, "R2_UNAVAILABLE", "图片存储暂时不可用，请重试");
  }
  return { objectKey, publicUrl: new URL(objectKey, env.publicBaseUrl).toString(), variants };
}
