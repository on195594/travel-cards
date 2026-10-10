import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "@/lib/capabilities";
import { getGuideById, type Guide } from "@/lib/guides";
import { callGuideTool, listGuideTools } from "@/lib/mcp/guide-tools";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const uploadImageMock = vi.fn();
vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    uploadImage: (...args: Parameters<typeof actual.uploadImage>) => uploadImageMock(...args),
  };
});
const actor: ApiActor = { authKind: "restricted-ai", actorLabel: "fake-oauth-client", scopes: ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload"] };
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
  if (!mongoose.connection.db) return;
  if (mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database cleanup");
  await mongoose.connection.collection("guides").deleteMany({ slug: /^mcp-tool-/ });
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("MCP Guide tool core (fake authenticated actor, real isolated persistence)", () => {
  it("advertises exactly six tools with input JSON Schemas and honest write annotations", () => {
    const tools = listGuideTools(actor);
    expect(tools.map((tool) => tool.name)).toEqual(["list_guides", "get_guide", "create_guide", "update_guide", "publish_guide", "upload_image"]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations.readOnlyHint).toBe(["list_guides", "get_guide"].includes(tool.name));
    }
    expect(tools.find((tool) => tool.name === "update_guide")!.description).toContain("never retry");
    expect(tools.find((tool) => tool.name === "create_guide")!.description).toContain("not verified");
    expect(tools.find((tool) => tool.name === "upload_image")!.description).toContain("cover image");
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
    const updated = await callGuideTool(actor, "upload_image", {
      data: `data:image/png;base64,${validPngBase64}`,
      alt: "西湖黄昏",
      guideId: guide.id,
      expectedRevision: 1,
    });
    expect(updated.structuredContent.guide).toMatchObject({
      id: guide.id,
      revision: 2,
      coverImage: {
        objectKey: "guides/new-cover.png",
        publicUrl: "https://images.example.test/new-cover.png",
        alt: "西湖黄昏",
      },
    });

    await expect(callGuideTool(actor, "upload_image", { data: "not-an-image", alt: "bad" })).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://127.0.0.1/private.png", alt: "ssrf" })).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://[::1]/private.png", alt: "ssrf-ipv6" })).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(callGuideTool(actor, "upload_image", { url: "https://example.com/pic.png", data: validPngBase64, alt: "both" })).rejects.toMatchObject({ name: "ZodError" });
    await expect(callGuideTool(actor, "upload_image", { data: validPngBase64, alt: "rev-without-id", expectedRevision: 1 })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects unknown actor kinds before validation or database access", async () => {
    const unknown = { authKind: "anonymous", actorLabel: "untrusted" } as unknown as ApiActor;
    expect(() => listGuideTools(unknown)).toThrow(expect.objectContaining({ status: 403 }));
    await expect(callGuideTool(unknown, "create_guide", { authKind: "session" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it.each([
    ["create_guide", { ...draft, authKind: "session" }],
    ["get_guide", { id: { $ne: null } }],
    ["list_guides", { q: "x".repeat(201) }],
    ["update_guide", { id: "a".repeat(24), expectedRevision: 1, status: "draft" }],
    ["publish_guide", { id: "a".repeat(24), expectedRevision: 0 }],
  ])("rejects invalid or undeclared input for %s", async (name, input) => {
    await expect(callGuideTool(actor, name as string, input)).rejects.toMatchObject({ name: "ZodError" });
  });
});
