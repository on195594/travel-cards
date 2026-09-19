import mongoose from "mongoose";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  createGuide,
  getGuideById,
  getPublishedGuideBySlug,
  guideDraftInputSchema,
  listPublishedGuides,
  publishGuide,
  unpublishGuide,
  updateGuide,
} from "@/lib/guides";

const testRunId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!testRunId || !/^[a-z0-9_]+$/.test(testRunId)) {
  throw new Error("Run database tests through `npm test` so each run owns an isolated MongoDB database");
}
const databaseName = `travel_cards_test_${testRunId}`;

function threeDayGuide(slug = "hangzhou-weekend") {
  return {
    title: "杭州三日游",
    slug,
    destination: "杭州",
    excerpt: "三天游览西湖与周边景点。",
    days: 3,
    coverImage: { objectKey: "guides/hangzhou.jpg", publicUrl: "https://images.example.test/hangzhou.jpg", alt: "杭州西湖" },
    itinerary: [1, 2, 3].map((day) => ({ day, title: `第 ${day} 天`, items: [{ place: `景点 ${day}`, description: "步行游览" }] })),
    sections: [{ kind: "transport" as const, title: "交通", body: "建议乘坐公共交通。" }],
    sources: [{ title: "官方旅游信息", url: "https://example.test/travel", accessedAt: "2026-08-29T10:00:00.000Z" }],
  };
}

function assertOwnedDatabase() {
  if (mongoose.connection.db?.databaseName !== databaseName) throw new Error("Refusing to clean a non-task test database");
}

afterEach(async () => {
  if (!mongoose.connection.db) return;
  assertOwnedDatabase();
  await mongoose.connection.collection("guides").deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState) {
    assertOwnedDatabase();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    global.mongooseConnection = undefined;
  }
});

describe("Guide aggregate", () => {
  it("validates itinerary bounds and source protocols", () => {
    expect(() => guideDraftInputSchema.parse({ ...threeDayGuide(), itinerary: [{ day: 4, title: "越界", items: [] }] })).toThrow("超出总天数");
    expect(() => guideDraftInputSchema.parse({ ...threeDayGuide(), sources: [{ title: "bad", url: "javascript:alert(1)", accessedAt: "2026-08-29T10:00:00.000Z" }] })).toThrow();
  });

  it("persists one three-day aggregate and keeps drafts out of public queries", async () => {
    const guide = await createGuide(threeDayGuide());
    expect(guide).toMatchObject({ status: "draft", revision: 1, days: 3 });
    expect(guide.itinerary).toHaveLength(3);
    await expect(listPublishedGuides()).resolves.toEqual([]);
    await expect(getPublishedGuideBySlug(guide.slug!)).resolves.toBeNull();
    await expect(getGuideById(guide.id)).resolves.toMatchObject({ title: guide.title });
  });

  it("enforces the partial unique slug index", async () => {
    await createGuide(threeDayGuide());
    await expect(createGuide(threeDayGuide())).rejects.toMatchObject({ code: 11000 });
    await expect(createGuide({ ...threeDayGuide(), slug: undefined })).resolves.toMatchObject({ status: "draft" });
  });

  it("publishes, exposes, unpublishes, and keeps a published slug immutable", async () => {
    const draft = await createGuide(threeDayGuide());
    const published = await publishGuide(draft.id, { expectedRevision: draft.revision });
    expect(published).toMatchObject({ status: "published", revision: 2, slug: draft.slug });
    expect(published.publishedAt).toBeTruthy();
    await expect(getPublishedGuideBySlug(draft.slug!)).resolves.toMatchObject({ id: draft.id });
    await expect(updateGuide(draft.id, { expectedRevision: published.revision, slug: "changed-slug" })).rejects.toMatchObject({ code: "PUBLISHED_SLUG_IMMUTABLE" });
    const unpublished = await unpublishGuide(draft.id, { expectedRevision: published.revision });
    expect(unpublished).toMatchObject({ status: "draft", revision: 3, publishedAt: undefined });
    await expect(updateGuide(draft.id, { expectedRevision: unpublished.revision, slug: "changed-after-unpublish" })).rejects.toMatchObject({ code: "PUBLISHED_SLUG_IMMUTABLE" });
    await expect(getPublishedGuideBySlug(draft.slug!)).resolves.toBeNull();
  });

  it("keeps every published edit publishable", async () => {
    const draft = await createGuide(threeDayGuide("published-invariant"));
    const published = await publishGuide(draft.id, { expectedRevision: draft.revision });
    await expect(updateGuide(draft.id, { expectedRevision: published.revision, title: "" })).rejects.toMatchObject({ code: "PUBLISH_REQUIREMENTS" });
    await expect(getPublishedGuideBySlug("published-invariant")).resolves.toMatchObject({ title: draft.title, revision: published.revision });
  });

  it("updates published content immediately while preserving publication", async () => {
    const draft = await createGuide(threeDayGuide("published-save"));
    const published = await publishGuide(draft.id, { expectedRevision: draft.revision });
    const updated = await updateGuide(draft.id, {
      expectedRevision: published.revision,
      title: "立即更新的公开标题",
    });

    expect(updated).toMatchObject({ status: "published", revision: published.revision + 1 });
    await expect(getPublishedGuideBySlug("published-save")).resolves.toMatchObject({
      title: "立即更新的公开标题",
      revision: updated.revision,
    });
  });

  it("does not lock a never-published draft when unpublish is called", async () => {
    const draft = await createGuide(threeDayGuide("never-published"));
    const stillDraft = await unpublishGuide(draft.id, { expectedRevision: draft.revision });
    await expect(updateGuide(draft.id, { expectedRevision: stillDraft.revision, slug: "still-editable" })).resolves.toMatchObject({ slug: "still-editable" });
  });

  it("atomically rejects a stale edit while preserving the winner", async () => {
    const draft = await createGuide(threeDayGuide());
    const winner = await updateGuide(draft.id, { expectedRevision: draft.revision, excerpt: "先保存的内容" });
    await expect(updateGuide(draft.id, { expectedRevision: draft.revision, excerpt: "过期标签页内容" })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    await expect(getGuideById(draft.id)).resolves.toMatchObject({ excerpt: "先保存的内容", revision: winner.revision });
  });

  it("rejects unbounded search queries before touching MongoDB", async () => {
    await expect(listPublishedGuides({ q: "x".repeat(201) })).rejects.toMatchObject({ code: "SEARCH_QUERY_TOO_LONG", status: 400 });
  });

  it("searches published guides by title, destination, and excerpt with safe regex escaping", async () => {
    const draft1 = await createGuide({ ...threeDayGuide("search-test-1"), title: "西安出发王朗大熊猫探秘", destination: "四川绵阳" });
    const draft2 = await createGuide({ ...threeDayGuide("search-test-2"), title: "青海湖环线自驾", destination: "青海西宁" });
    await publishGuide(draft1.id, { expectedRevision: draft1.revision });
    await publishGuide(draft2.id, { expectedRevision: draft2.revision });

    const titleMatch = await listPublishedGuides({ q: "大熊猫" });
    expect(titleMatch.some((g) => g.title.includes("大熊猫"))).toBe(true);
    expect(titleMatch[0]).not.toHaveProperty("itinerary");
    expect(titleMatch[0]).not.toHaveProperty("sections");
    expect(titleMatch[0]).not.toHaveProperty("sources");

    const destMatch = await listPublishedGuides({ q: "西宁" });
    expect(destMatch.some((g) => g.destination.includes("西宁"))).toBe(true);

    const regexMatch = await listPublishedGuides({ q: ".*+?^${}()" });
    expect(regexMatch).toEqual([]);

    const emptyMatch = await listPublishedGuides({ q: "不存在的火星地点" });
    expect(emptyMatch).toEqual([]);
  });

  it("supports direct publishing on creation when publish requirements are satisfied", async () => {
    const published = await createGuide({ ...threeDayGuide("direct-publish-test"), publish: true });
    expect(published).toMatchObject({
      status: "published",
      revision: 1,
      slug: "direct-publish-test",
    });
    expect(published.publishedAt).toBeTruthy();

    const fromSlug = await getPublishedGuideBySlug("direct-publish-test");
    expect(fromSlug).toMatchObject({ id: published.id, title: published.title });

    // Slug is locked upon publishing
    await expect(updateGuide(published.id, { expectedRevision: published.revision, slug: "different-slug" })).rejects.toMatchObject({
      code: "PUBLISHED_SLUG_IMMUTABLE",
    });

    // Also works with status: "published" directly
    const statusPublished = await createGuide({ ...threeDayGuide("direct-status-published"), status: "published" });
    expect(statusPublished.status).toBe("published");
    expect(statusPublished.publishedAt).toBeTruthy();
  });

  it("rejects direct publishing on creation if publish requirements are not met", async () => {
    await expect(createGuide({ ...threeDayGuide("fail-no-cover"), publish: true, coverImage: undefined })).rejects.toMatchObject({
      code: "PUBLISH_REQUIREMENTS",
    });
    await expect(createGuide({ ...threeDayGuide("fail-no-title"), publish: true, title: "" })).rejects.toMatchObject({
      code: "PUBLISH_REQUIREMENTS",
    });
  });
});
