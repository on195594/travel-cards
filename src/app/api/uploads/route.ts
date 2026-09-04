import { requireAdmin } from "@/auth";
import { assertSameOrigin, jsonError, HttpError } from "@/lib/http";
import { MAX_MULTIPART_BYTES, uploadImage } from "@/lib/storage/r2";

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
    if (total > MAX_MULTIPART_BYTES) {
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
    await requireAdmin(request);
    assertSameOrigin(request);

    const encoding = request.headers.get("content-encoding");
    if (encoding && encoding.toLowerCase() !== "identity") throw new HttpError(400, "UNSUPPORTED_ENCODING", "上传请求不支持压缩编码");
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data\s*;.*boundary=/i.test(contentType)) throw new HttpError(400, "INVALID_MULTIPART", "上传请求必须是 multipart/form-data");
    const length = request.headers.get("content-length");
    if (length !== null) {
      if (!/^\d+$/.test(length)) throw new HttpError(400, "INVALID_CONTENT_LENGTH", "Content-Length 无效");
      if (Number(length) > MAX_MULTIPART_BYTES) throw new HttpError(413, "REQUEST_TOO_LARGE", "上传请求过大");
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
    const entries = [...form.entries()];
    if (entries.length !== 1 || entries[0][0] !== "file" || typeof entries[0][1] === "string") {
      throw new HttpError(400, "INVALID_UPLOAD_SHAPE", "上传请求必须且只能包含一个 file 字段");
    }
    const file = entries[0][1];
    const result = await uploadImage(new Uint8Array(await file.arrayBuffer()), file.type);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
