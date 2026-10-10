import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "@/lib/capabilities";
import { getGuideById, type Guide } from "@/lib/guides";
import { callGuideTool, listGuideTools } from "@/lib/mcp/guide-tools";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const actor: ApiActor = { authKind: "restricted-ai", actorLabel: "fake-oauth-client", scopes: ["guide.read", "guide.create", "guide.update", "guide.publish"] };
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
  it("advertises exactly five tools with input JSON Schemas and honest write annotations", () => {
    const tools = listGuideTools(actor);
    expect(tools.map((tool) => tool.name)).toEqual(["list_guides", "get_guide", "create_guide", "update_guide", "publish_guide"]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations.readOnlyHint).toBe(["list_guides", "get_guide"].includes(tool.name));
    }
    expect(tools.find((tool) => tool.name === "update_guide")!.description).toContain("never retry");
    expect(tools.find((tool) => tool.name === "create_guide")!.description).toContain("not verified");
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

  it.each(["delete_guide", "unpublish_guide", "upload_image", "manage_config", "generate_guide", "__proto__"])("rejects unapproved tool %s without changing data", async (name) => {
    const guide = await create(true);
    await expect(callGuideTool(actor, name, { id: guide.id, expectedRevision: 1 })).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
    expect(await getGuideById(guide.id)).toEqual(guide);
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
