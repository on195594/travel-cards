import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "@/lib/capabilities";
import { getGuideById, updateGuide, type Guide } from "@/lib/guides";
import { callGuideTool, listGuideTools } from "@/lib/mcp/guide-tools";
import * as imageFetch from "@/lib/storage/fetch-image";
import * as attachmentFetch from "@/lib/storage/fetch-attachment";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const uploadImageMock = vi.fn();
const uploadAttachmentMock = vi.fn();
vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    uploadImage: (...args: Parameters<typeof actual.uploadImage>) => uploadImageMock(...args),
  };
});
vi.mock("@/lib/storage/attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/attachments")>();
  return {
    ...actual,
    uploadAttachment: (...args: Parameters<typeof actual.uploadAttachment>) => uploadAttachmentMock(...args),
  };
});
const actor: ApiActor = { authKind: "restricted-ai", actorLabel: "fake-oauth-client", scopes: ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload", "attachment.upload"] };
const validPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const draft = {
  title: "西湖一日游", slug: "mcp-tool-hangzhou", destination: "杭州", excerpt: "西湖漫步", days: 1,
  coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" },
  itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行游览" }] }],
  sources: [{ title: "旅游参考", url: "https://example.test/travel", accessedAt: "2026-10-09T00:00:00.000Z" }],
};
async function create(publish = false) {
  const output = await callGuideTool(actor, "create_guide", { ...draft, publish });
  expect(JSON.parse(output.content[0].text)).toEqual(output.structuredContent);
  return output.structuredContent.guide as Guide;
}

afterEach(async () => {
  vi.restoreAllMocks();
  uploadImageMock.mockReset();
  uploadAttachmentMock.mockReset();
  if (!mongoose.connection.db) return;
  if (mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database cleanup");
  await mongoose.connection.collection("guides").deleteMany({ slug: /^mcp-tool-/ });
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("MCP Guide tool core (fake authenticated actor, real isolated persistence)", () => {
  it("advertises exactly seven tools with input JSON Schemas and honest write annotations", () => {
    const tools = listGuideTools(actor);
    expect(tools.map((tool) => tool.name)).toEqual(["list_guides", "get_guide", "create_guide", "update_guide", "publish_guide", "upload_image", "upload_attachment"]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations.readOnlyHint).toBe(["list_guides", "get_guide"].includes(tool.name));
      expect(tool.annotations.destructiveHint).toBe(!tool.annotations.readOnlyHint);
      expect(tool.annotations.openWorldHint).toBe(["upload_image", "upload_attachment"].includes(tool.name));
    }
    expect(tools.find((tool) => tool.name === "update_guide")!.description).toContain("never retry");
    expect(tools.find((tool) => tool.name === "create_guide")!.description).toContain("not verified");
    expect(tools.find((tool) => tool.name === "upload_image")!.description).toContain("cover image");
    expect(tools.find((tool) => tool.name === "upload_image")!.description).toContain("2 MiB total JSON request");
    expect(tools.find((tool) => tool.name === "upload_attachment")!.description).toContain("GPX/KML route track or PDF");
  });

  it("creates, searches, reads, updates and publishes with the existing audit identity", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => {});
    const guide = await create();
    expect(guide.status).toBe("draft");
    const listed = await callGuideTool(actor, "list_guides", { q: "西湖" });
    expect(listed.structuredContent.guides).toEqual(expect.arrayContaining([expect.objectContaining({ id: guide.id })]));
    const read = await callGuideTool(actor, "get_guide", { id: guide.id });
    expect(read.structuredContent.guide).toMatchObject({ sources: draft.sources, revision: 1 });
    const changed = await callGuideTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, excerpt: "更新后的行程" });
    expect(changed.structuredContent.guide).toMatchObject({ revision: 2 });
    const published = await callGuideTool(actor, "publish_guide", { id: guide.id, expectedRevision: 2 });
    expect(published.structuredContent.guide).toMatchObject({ status: "published", revision: 3 });
    expect(audit).toHaveBeenLastCalledWith("admin_action", expect.objectContaining({ authKind: "restricted-ai", actorLabel: "fake-oauth-client", action: "guide.publish", beforeRevision: 2, afterRevision: 3 }));
  });

  it("supports omitted arguments for listing", async () => {
    expect((await callGuideTool(actor, "list_guides")).structuredContent.guides).toBeInstanceOf(Array);
    expect((await callGuideTool(actor, "list_guides", null)).structuredContent.guides).toBeInstanceOf(Array);
  });

  it("bounds list results, signals additional matches and filters before applying the limit", async () => {
    await create();
    await callGuideTool(actor, "create_guide", { ...draft, slug: "mcp-tool-second", title: "另一个目的地" });
    const limited = await callGuideTool(actor, "list_guides", { q: "西湖", limit: 1 });
    expect(limited.structuredContent.guides).toHaveLength(1);
    expect(limited.structuredContent.hasMore).toBe(true);
    const filtered = await callGuideTool(actor, "list_guides", { q: "另一个目的地", limit: 1 });
    expect(filtered.structuredContent.guides).toEqual([expect.objectContaining({ title: "另一个目的地" })]);
    expect(filtered.structuredContent.hasMore).toBe(false);
    expect(JSON.parse(filtered.content[0].text)).toEqual(filtered.structuredContent);
    expect((await callGuideTool(actor, "list_guides", { q: "不存在" })).structuredContent).toEqual({ guides: [], hasMore: false });
  });

  it("preserves the default 100-result bound and detects truncation without a count query", async () => {
    await create();
    const now = new Date();
    await mongoose.connection.collection("guides").insertMany(Array.from({ length: 100 }, (_, index) => ({ ...draft, slug: `mcp-tool-list-${index}`, status: "draft", revision: 1, createdAt: now, updatedAt: now })));
    const listed = await callGuideTool(actor, "list_guides");
    expect(listed.structuredContent.guides).toHaveLength(100);
    expect(listed.structuredContent.hasMore).toBe(true);
  });

  it("supports concise write responses and retains revisions, full persistence and conflict protection", async () => {
    const created = await callGuideTool(actor, "create_guide", { ...draft, responseMode: "summary" });
    const summary = created.structuredContent.guide as Guide;
    expect(summary).toMatchObject({ title: draft.title, revision: 1, status: "draft" });
    expect(summary).not.toHaveProperty("itinerary");
    expect(await getGuideById(summary.id)).toMatchObject({ itinerary: draft.itinerary, sources: draft.sources });
    const updated = await callGuideTool(actor, "update_guide", { id: summary.id, expectedRevision: 1, title: "摘要模式更新", responseMode: "summary" });
    expect(updated.structuredContent.guide).toMatchObject({ revision: 2, title: "摘要模式更新" });
    expect(updated.structuredContent.guide).not.toHaveProperty("sources");
    await expect(callGuideTool(actor, "update_guide", { id: summary.id, expectedRevision: 1, title: "不应覆盖", responseMode: "summary" })).rejects.toMatchObject({ status: 409 });
    const published = await callGuideTool(actor, "publish_guide", { id: summary.id, expectedRevision: 2, responseMode: "summary" });
    expect(published.structuredContent.guide).toMatchObject({ revision: 3, status: "published" });
    expect(published.structuredContent.guide).not.toHaveProperty("itinerary");
    const full = await callGuideTool(actor, "update_guide", { id: summary.id, expectedRevision: 3, responseMode: "full" });
    expect(full.structuredContent.guide).toMatchObject({ revision: 4, itinerary: draft.itinerary });
    expect(JSON.parse(published.content[0].text)).toEqual(published.structuredContent);
  });

  it("supports direct publishing but preserves completeness, slug uniqueness and revision checks", async () => {
    await expect(callGuideTool(actor, "create_guide", { title: "未完成", publish: true })).rejects.toMatchObject({ code: "PUBLISH_REQUIREMENTS" });
    const guide = await create(true);
    expect(guide.status).toBe("published");
    await expect(create(true)).rejects.toMatchObject({ code: 11000 });
    await expect(callGuideTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, title: "" })).rejects.toMatchObject({ code: "PUBLISH_REQUIREMENTS" });
    await expect(callGuideTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, slug: "mcp-tool-changed" })).rejects.toMatchObject({ code: "PUBLISHED_SLUG_IMMUTABLE" });
    const patch = { id: guide.id, expectedRevision: 1, excerpt: "新简介" };
    await callGuideTool(actor, "update_guide", patch);
    await expect(callGuideTool(actor, "update_guide", patch)).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    await expect(callGuideTool(actor, "publish_guide", { id: guide.id, expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, excerpt: "新简介", status: "published" });
  });

  it("rejects every unapproved tool without changing data", async () => {
    const guide = await create(true);
    for (const name of ["delete_guide", "unpublish_guide", "manage_config", "generate_guide", "__proto__"]) {
      await expect(callGuideTool(actor, name, { id: guide.id, expectedRevision: 1 }), name).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
      expect(await getGuideById(guide.id)).toEqual(guide);
    }
  });

  it("uploads an image and optionally sets it on a guide", async () => {
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new-cover.png", publicUrl: "https://images.example.test/new-cover.png" });
    const standalone = await callGuideTool(actor, "upload_image", { data: validPngBase64, alt: "西湖日出" });
    expect(standalone.structuredContent.coverImage).toEqual({
      objectKey: "guides/new-cover.png",
      publicUrl: "https://images.example.test/new-cover.png",
      alt: "西湖日出",
    });

    const guide = await create();
    const variants = [{ objectKey: "guides/new-cover-480w.webp", publicUrl: "https://images.example.test/new-cover-480w.webp", width: 480, height: 320 }];
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new-cover.png", publicUrl: "https://images.example.test/new-cover.png", variants });
    const updated = await callGuideTool(actor, "upload_image", {
      data: `data:image/png;base64,${validPngBase64}`,
      alt: "西湖黄昏",
      guideId: guide.id,
      expectedRevision: 1,
      responseMode: "summary",
    });
    expect(updated.structuredContent.guide).toMatchObject({
      id: guide.id,
      revision: 2,
      coverImage: {
        objectKey: "guides/new-cover.png",
        publicUrl: "https://images.example.test/new-cover.png",
        alt: "西湖黄昏",
        variants,
      },
    });
    expect(updated.structuredContent.guide).not.toHaveProperty("itinerary");
    expect((await getGuideById(guide.id)).coverImage).toMatchObject({ variants });

    await expect(callGuideTool(actor, "upload_image", { data: "not-an-image", alt: "bad" })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://127.0.0.1/private.png", alt: "ssrf" })).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://[::1]/private.png", alt: "ssrf-ipv6" })).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://example.com/pic.png", data: validPngBase64, alt: "both" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(callGuideTool(actor, "upload_image", { data: validPngBase64, alt: "rev-without-id", expectedRevision: 1 })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("uploads standalone attachment and attaches to existing guide with update scope", async () => {
    uploadAttachmentMock.mockResolvedValue({
      objectKey: "attachments/test-track.gpx",
      publicUrl: "https://images.example.test/test-track.gpx",
      size: 1024,
      type: "gpx",
    });
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>西湖环线</name></trk></gpx>`;
    const standalone = await callGuideTool(actor, "upload_attachment", {
      name: "西湖环线.gpx",
      type: "gpx",
      content: gpxContent,
      description: "环湖徒步航迹",
    });
    expect(standalone.structuredContent.attachment).toMatchObject({
      name: "西湖环线.gpx",
      type: "gpx",
      publicUrl: "https://images.example.test/test-track.gpx",
      description: "环湖徒步航迹",
    });

    const guide = await create();
    uploadAttachmentMock.mockResolvedValue({
      objectKey: "attachments/guide-map.pdf",
      publicUrl: "https://images.example.test/guide-map.pdf",
      size: 2048,
      type: "pdf",
    });
    const pdfBase64 = Buffer.from("%PDF-1.4 test pdf content").toString("base64");
    const attached = await callGuideTool(actor, "upload_attachment", {
      name: "导览手册.pdf",
      type: "pdf",
      data: pdfBase64,
      guideId: guide.id,
      expectedRevision: guide.revision,
      responseMode: "summary",
    });
    expect(attached.structuredContent.attachment).toMatchObject({
      name: "导览手册.pdf",
      type: "pdf",
      publicUrl: "https://images.example.test/guide-map.pdf",
    });
    expect(attached.structuredContent.guide).toMatchObject({
      id: guide.id,
      revision: 2,
    });
    const reloaded = await getGuideById(guide.id);
    expect(reloaded.attachments).toHaveLength(1);
    expect(reloaded.attachments[0].name).toBe("导览手册.pdf");

    // Scope check: attachment.upload without guide.update cannot update guide
    const attachOnly: ApiActor = { ...actor, scopes: ["guide.read", "attachment.upload"] };
    await expect(callGuideTool(attachOnly, "upload_attachment", {
      name: "测试.gpx",
      type: "gpx",
      content: gpxContent,
      guideId: guide.id,
      expectedRevision: 2,
    })).rejects.toMatchObject({ status: 403 });

    // Zod error validations
    await expect(callGuideTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(callGuideTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx", content: gpxContent, url: "https://example.com/test.gpx" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(callGuideTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx", content: gpxContent, guideId: guide.id })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects unknown actor kinds before validation or database access", async () => {
    const unknown = { authKind: "anonymous", actorLabel: "untrusted" } as unknown as ApiActor;
    expect(() => listGuideTools(unknown)).toThrow(expect.objectContaining({ status: 403 }));
    await expect(callGuideTool(unknown, "create_guide", { authKind: "session" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it.each(["upload_image", "upload_attachment"])("rejects missing and stale %s targets before downloading or uploading", async (name) => {
    const downloadImage = vi.spyOn(imageFetch, "fetchImageFromUrl").mockResolvedValue({ bytes: Buffer.from(validPngBase64, "base64"), mime: "image/png" });
    const downloadAttachment = vi.spyOn(attachmentFetch, "fetchAttachmentFromUrl").mockResolvedValue({ bytes: Buffer.from("%PDF-1.4 test"), type: "pdf", mime: "application/pdf", extension: "pdf" });
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new.png", publicUrl: "https://images.example.test/new.png" });
    uploadAttachmentMock.mockResolvedValue({ objectKey: "attachments/new.pdf", publicUrl: "https://images.example.test/new.pdf", size: 13, type: "pdf" });
    const guide = await create();
    await updateGuide(guide.id, { expectedRevision: 1, title: "已由其他编辑保存" });
    const args = name === "upload_image"
      ? { url: "https://images.example.test/cover.png", alt: "封面" }
      : { url: "https://images.example.test/route.pdf", name: "路线.pdf", type: "pdf" };
    await expect(callGuideTool(actor, name, { ...args, guideId: "0".repeat(24), expectedRevision: 1 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(callGuideTool(actor, name, { ...args, guideId: guide.id, expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(downloadImage).not.toHaveBeenCalled();
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(uploadAttachmentMock).not.toHaveBeenCalled();
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, title: "已由其他编辑保存", coverImage: draft.coverImage, attachments: [] });
  });

  it.each(["upload_image", "upload_attachment"])("preserves concurrent edits made during %s and does not replay uploads", async (name) => {
    const guide = await create();
    const concurrentEdit = () => updateGuide(guide.id, { expectedRevision: 1, title: "上传期间保存的内容" });
    uploadImageMock.mockImplementationOnce(async () => {
      await concurrentEdit();
      return { objectKey: "guides/new.png", publicUrl: "https://images.example.test/new.png" };
    });
    uploadAttachmentMock.mockImplementationOnce(async () => {
      await concurrentEdit();
      return { objectKey: "attachments/new.pdf", publicUrl: "https://images.example.test/new.pdf", size: 13, type: "pdf" };
    });
    const args = name === "upload_image"
      ? { data: validPngBase64, alt: "封面" }
      : { data: Buffer.from("%PDF-1.4 test").toString("base64"), name: "路线.pdf", type: "pdf" };
    await expect(callGuideTool(actor, name, { ...args, guideId: guide.id, expectedRevision: 1 })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(name === "upload_image" ? uploadImageMock : uploadAttachmentMock).toHaveBeenCalledTimes(1);
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, title: "上传期间保存的内容", coverImage: draft.coverImage, attachments: [] });
  });

  it("checks cover replacement scope before any upload side effect", async () => {
    uploadImageMock.mockClear();
    const uploadOnly: ApiActor = { ...actor, scopes: ["guide.read", "image.upload"] };
    await expect(callGuideTool(uploadOnly, "upload_image", {
      data: validPngBase64, alt: "封面", guideId: "a".repeat(24), expectedRevision: 1,
    })).rejects.toMatchObject({ status: 403 });
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it.each([
    ["create_guide", { ...draft, authKind: "session" }],
    ["get_guide", { id: { $ne: null } }],
    ["list_guides", { q: "x".repeat(201) }],
    ["list_guides", { limit: 0 }],
    ["list_guides", { limit: 101 }],
    ["list_guides", { limit: "5" }],
    ["create_guide", { ...draft, responseMode: "minimal" }],
    ["update_guide", { id: "a".repeat(24), expectedRevision: 1, status: "draft" }],
    ["publish_guide", { id: "a".repeat(24), expectedRevision: 0 }],
  ])("rejects invalid or undeclared input for %s", async (name, input) => {
    await expect(callGuideTool(actor, name as string, input)).rejects.toMatchObject({ name: "ZodError" });
  });
});
