import { randomUUID } from "node:crypto";
import { requireCapability } from "@/auth";
import { assertSameOrigin, jsonError, HttpError, PRIVATE_NO_STORE_HEADERS } from "@/lib/http";
import { MAX_ATTACHMENT_MULTIPART_BYTES, uploadAttachment } from "@/lib/storage/attachments";
import type { GuideAttachment } from "@/lib/guides/schema";

export const runtime = "nodejs";

async function boundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new HttpError(400, "EMPTY_BODY", "上传请求不能为空");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ATTACHMENT_MULTIPART_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "REQUEST_TOO_LARGE", "上传请求过大");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request) {
  try {
    await requireCapability(request, "attachment.upload");
    assertSameOrigin(request);

    const encoding = request.headers.get("content-encoding");
    if (encoding && encoding.toLowerCase() !== "identity") throw new HttpError(400, "UNSUPPORTED_ENCODING", "上传请求不支持压缩编码");
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;.*boundary=/i.test(contentType)) throw new HttpError(400, "INVALID_MULTIPART", "上传请求必须是 multipart/form-data");
    const length = request.headers.get("content-length");
    if (length !== null) {
      if (!/^\d+$/.test(length)) throw new HttpError(400, "INVALID_CONTENT_LENGTH", "Content-Length 无效");
      if (Number(length) > MAX_ATTACHMENT_MULTIPART_BYTES) throw new HttpError(413, "REQUEST_TOO_LARGE", "上传请求过大");
    }

    const body = await boundedBody(request);
    let form: FormData;
    try {
      const bounded = new ArrayBuffer(body.byteLength);
      new Uint8Array(bounded).set(body);
      form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bounded }).formData();
    } catch {
      throw new HttpError(400, "INVALID_MULTIPART", "multipart 请求无法解析");
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      throw new HttpError(400, "INVALID_UPLOAD_SHAPE", "上传请求必须包含 file 文件字段");
    }

    const rawName = form.get("name");
    const customName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : (typeof file.name === "string" ? file.name.trim() : "attachment");
    if (!customName || customName.length > 200) {
      throw new HttpError(400, "INVALID_ATTACHMENT_NAME", "附件名称不能为空且不能超过 200 个字符");
    }

    const rawDescription = form.get("description");
    const description = typeof rawDescription === "string" && rawDescription.trim() ? rawDescription.trim() : undefined;
    if (description && description.length > 1000) {
      throw new HttpError(400, "INVALID_ATTACHMENT_DESCRIPTION", "附件描述不能超过 1000 个字符");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadAttachment(bytes, customName);

    const attachment: GuideAttachment = {
      id: randomUUID(),
      name: customName,
      type: uploaded.type,
      size: uploaded.size,
      objectKey: uploaded.objectKey,
      publicUrl: uploaded.publicUrl,
      ...(description ? { description } : {}),
    };

    return Response.json({ attachment }, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
