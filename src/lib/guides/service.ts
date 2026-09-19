import { HttpError } from "@/lib/http";
import {
  guideCreateInputSchema,
  guideDraftInputSchema,
  guidePatchSchema,
  expectedRevisionSchema,
  MAX_SEARCH_QUERY_LENGTH,
  type Guide,
  type GuideDraftInput,
  type GuideListOptions,
  type GuideSummary,
} from "./schema";
import {
  deleteGuideRecord,
  findAdminGuideSummaries,
  findGuideById,
  findPublishedGuideBySlug,
  findPublishedGuideSummaries,
  guideExists,
  guideSlugIsLocked,
  insertGuide,
  setGuidePublished,
  setGuideUnpublished,
  updateGuideRecord,
} from "./repository";

function searchQuery(options: GuideListOptions | number): string | undefined {
  const q = typeof options === "number" ? undefined : options.q?.trim();
  if (q && q.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new HttpError(
      400,
      "SEARCH_QUERY_TOO_LONG",
      "搜索关键词不能超过 200 个字符"
    );
  }
  return q || undefined;
}

function listLimit(options: GuideListOptions | number) {
  return typeof options === "number" ? options : (options.limit ?? 100);
}

async function findByIdOrThrow(id: string): Promise<Guide> {
  const guide = await findGuideById(id);
  if (!guide) throw new HttpError(404, "NOT_FOUND", "攻略不存在");
  return guide;
}

async function conflictOrMissing(id: string): Promise<never> {
  if (await guideExists(id)) {
    throw new HttpError(
      409,
      "REVISION_CONFLICT",
      "攻略已被其他编辑更新，请保留当前内容并刷新后重试"
    );
  }
  throw new HttpError(404, "NOT_FOUND", "攻略不存在");
}

export function contentOf(guide: Guide): GuideDraftInput {
  return guideDraftInputSchema.parse({
    title: guide.title,
    slug: guide.slug,
    destination: guide.destination,
    excerpt: guide.excerpt,
    days: guide.days,
    coverImage: guide.coverImage,
    itinerary: guide.itinerary,
    sections: guide.sections,
    sources: guide.sources,
  });
}

export function validatePublish(
  guide: Pick<
    GuideDraftInput,
    "title" | "slug" | "destination" | "excerpt" | "coverImage" | "itinerary"
  >
) {
  if (
    !guide.title ||
    !guide.slug ||
    !guide.destination ||
    !guide.excerpt ||
    !guide.coverImage?.alt ||
    !guide.coverImage.publicUrl ||
    guide.itinerary.length < 1
  ) {
    throw new HttpError(
      400,
      "PUBLISH_REQUIREMENTS",
      "发布前需填写标题、slug、目的地、简介、封面与 alt，并至少包含一天行程"
    );
  }
}

export async function createGuide(input: unknown): Promise<Guide> {
  const values = guideCreateInputSchema.parse(input);
  const shouldPublish =
    values.publish === true || values.status === "published";
  if (shouldPublish) validatePublish(values);
  const now = new Date();
  return insertGuide({
    ...values,
    slug: values.slug || undefined,
    status: shouldPublish ? "published" : "draft",
    revision: 1,
    publishedAt: shouldPublish ? now : undefined,
    slugLocked: shouldPublish ? true : undefined,
  });
}

export async function listPublishedGuides(
  options: GuideListOptions | number = {}
): Promise<GuideSummary[]> {
  return findPublishedGuideSummaries(searchQuery(options), listLimit(options));
}

export async function listAdminGuides(
  options: GuideListOptions | number = {}
): Promise<GuideSummary[]> {
  return findAdminGuideSummaries(searchQuery(options), listLimit(options));
}

export async function getGuideById(id: string): Promise<Guide> {
  return findByIdOrThrow(id);
}

export async function getPublishedGuideBySlug(
  slug: string
): Promise<Guide | null> {
  return findPublishedGuideBySlug(slug);
}

export async function updateGuide(id: string, input: unknown): Promise<Guide> {
  const { expectedRevision, ...patch } = guidePatchSchema.parse(input);
  const current = await findByIdOrThrow(id);
  if (current.revision !== expectedRevision) return conflictOrMissing(id);
  const merged = guideDraftInputSchema.parse({
    ...contentOf(current),
    ...patch,
  });
  const slugLocked =
    current.status === "published" || (await guideSlugIsLocked(id));
  if (slugLocked && merged.slug !== current.slug) {
    throw new HttpError(
      400,
      "PUBLISHED_SLUG_IMMUTABLE",
      "已发布攻略的 slug 不可修改"
    );
  }
  if (current.status === "published") validatePublish(merged);

  const setValues: Record<string, unknown> = { ...merged };
  const unsetValues: Record<string, 1> = {};
  if (!merged.slug) {
    delete setValues.slug;
    unsetValues.slug = 1;
  }
  if (!merged.coverImage) {
    delete setValues.coverImage;
    unsetValues.coverImage = 1;
  }
  return (
    (await updateGuideRecord(id, expectedRevision, setValues, unsetValues)) ??
    conflictOrMissing(id)
  );
}

export async function publishGuide(
  id: string,
  input: unknown
): Promise<Guide> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  const current = await findByIdOrThrow(id);
  if (current.revision !== expectedRevision) return conflictOrMissing(id);
  validatePublish(current);
  return (
    (await setGuidePublished(id, expectedRevision)) ?? conflictOrMissing(id)
  );
}

export async function unpublishGuide(
  id: string,
  input: unknown
): Promise<Guide> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  const current = await findByIdOrThrow(id);
  if (current.revision !== expectedRevision) return conflictOrMissing(id);
  return (
    (await setGuideUnpublished(
      id,
      expectedRevision,
      current.status === "published"
    )) ?? conflictOrMissing(id)
  );
}

export async function deleteGuide(
  id: string,
  input: unknown
): Promise<{ id: string; slug?: string; revision: number }> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  return (
    (await deleteGuideRecord(id, expectedRevision)) ?? conflictOrMissing(id)
  );
}
