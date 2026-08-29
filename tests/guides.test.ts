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

const databaseName = "travel_cards_phase1_test";

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
    await expect(getPublishedGuideBySlug(draft.slug!)).resolves.toBeNull();
  });

  it("atomically rejects a stale edit while preserving the winner", async () => {
    const draft = await createGuide(threeDayGuide());
    const winner = await updateGuide(draft.id, { expectedRevision: draft.revision, excerpt: "先保存的内容" });
    await expect(updateGuide(draft.id, { expectedRevision: draft.revision, excerpt: "过期标签页内容" })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    await expect(getGuideById(draft.id)).resolves.toMatchObject({ excerpt: "先保存的内容", revision: winner.revision });
  });
});
