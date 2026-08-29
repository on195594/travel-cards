import mongoose, { Schema } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";

const httpUrl = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "URL must use http or https");
const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符");
const optionalSlug = z.preprocess((value) => value === "" ? undefined : value, slugSchema.optional());

export const sourceRefSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: httpUrl,
  accessedAt: z.string().datetime(),
  citedText: z.string().max(2000).optional(),
});

export const itineraryDaySchema = z.object({
  day: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  items: z.array(z.object({
    time: z.string().max(50).optional(),
    place: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(5000),
    tips: z.string().max(2000).optional(),
  })),
});

export const sectionSchema = z.object({
  kind: z.enum(["transport", "stay", "food", "budget", "safety", "other"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});

const draftGuideObject = z.object({
  title: z.string().trim().max(200).default(""),
  slug: optionalSlug,
  destination: z.string().trim().max(200).default(""),
  excerpt: z.string().trim().max(1000).default(""),
  days: z.number().int().min(1).max(365).default(1),
  coverImage: z.object({
    objectKey: z.string().trim().min(1).max(1000),
    publicUrl: httpUrl,
    alt: z.string().trim().max(500),
  }).optional(),
  itinerary: z.array(itineraryDaySchema).default([]),
  sections: z.array(sectionSchema).default([]),
  sources: z.array(sourceRefSchema).default([]),
});

function checkDayNumbers(value: { days: number; itinerary: Array<{ day: number }> }, context: z.RefinementCtx) {
  const seen = new Set<number>();
  for (const entry of value.itinerary) {
    if (entry.day > value.days) context.addIssue({ code: "custom", path: ["itinerary"], message: `第 ${entry.day} 天超出总天数` });
    if (seen.has(entry.day)) context.addIssue({ code: "custom", path: ["itinerary"], message: `第 ${entry.day} 天重复` });
    seen.add(entry.day);
  }
}

export const guideDraftInputSchema = draftGuideObject.superRefine(checkDayNumbers);
export const guideCandidateSchema = draftGuideObject.omit({ slug: true, coverImage: true }).required().superRefine(checkDayNumbers);
export const guideAnswerSchema = z.object({ answer: z.string().trim().min(1), sources: z.array(sourceRefSchema) });
export const aiResultSchema = <T extends z.ZodType>(data: T) => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("candidate"), data }),
  z.object({ kind: z.literal("clarification"), questions: z.array(z.string().trim().min(1)).min(1) }),
]);

export const guideSchema = draftGuideObject.extend({
  id: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().min(1),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine(checkDayNumbers);

export const guidePatchSchema = draftGuideObject.partial().extend({ expectedRevision: z.number().int().min(1) });
export const expectedRevisionSchema = z.object({ expectedRevision: z.number().int().min(1) });

export type Guide = z.infer<typeof guideSchema>;
export type GuideDraftInput = z.infer<typeof guideDraftInputSchema>;

const itemMongooseSchema = new Schema({
  time: String, place: { type: String, required: true }, description: { type: String, required: true }, tips: String,
}, { _id: false });
const itineraryMongooseSchema = new Schema({
  day: { type: Number, required: true }, title: { type: String, required: true }, items: { type: [itemMongooseSchema], default: [] },
}, { _id: false });
const sectionMongooseSchema = new Schema({
  kind: { type: String, enum: ["transport", "stay", "food", "budget", "safety", "other"], required: true },
  title: { type: String, required: true }, body: { type: String, required: true },
}, { _id: false });
const sourceMongooseSchema = new Schema({
  title: { type: String, required: true }, url: { type: String, required: true }, accessedAt: { type: Date, required: true }, citedText: String,
}, { _id: false });
const guideMongooseSchema = new Schema({
  title: { type: String, default: "" },
  slug: String,
  destination: { type: String, default: "" },
  excerpt: { type: String, default: "" },
  days: { type: Number, default: 1 },
  coverImage: { objectKey: String, publicUrl: String, alt: String, _id: false },
  itinerary: { type: [itineraryMongooseSchema], default: [] },
  sections: { type: [sectionMongooseSchema], default: [] },
  sources: { type: [sourceMongooseSchema], default: [] },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  revision: { type: Number, default: 1 },
  publishedAt: Date,
}, { timestamps: true, versionKey: false });
guideMongooseSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });

const GuideModel = mongoose.models.Guide || mongoose.model("Guide", guideMongooseSchema);

function serialized(record: Record<string, unknown>): Guide {
  return guideSchema.parse({
    ...record,
    id: String(record._id),
    _id: undefined,
    createdAt: new Date(record.createdAt as Date).toISOString(),
    updatedAt: new Date(record.updatedAt as Date).toISOString(),
    publishedAt: record.publishedAt ? new Date(record.publishedAt as Date).toISOString() : undefined,
    sources: Array.isArray(record.sources) ? record.sources.map((source) => ({
      ...(source as Record<string, unknown>),
      accessedAt: new Date((source as Record<string, unknown>).accessedAt as Date).toISOString(),
    })) : [],
  });
}

async function ready() {
  await connectDb();
  await GuideModel.init();
}

function objectId(id: string) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new HttpError(404, "NOT_FOUND", "攻略不存在");
  return new mongoose.Types.ObjectId(id);
}

function contentOf(guide: Guide): GuideDraftInput {
  return guideDraftInputSchema.parse({
    title: guide.title, slug: guide.slug, destination: guide.destination, excerpt: guide.excerpt, days: guide.days,
    coverImage: guide.coverImage, itinerary: guide.itinerary, sections: guide.sections, sources: guide.sources,
  });
}

async function findByIdOrThrow(id: string): Promise<Guide> {
  await ready();
  const record = await GuideModel.findById(objectId(id)).lean();
  if (!record) throw new HttpError(404, "NOT_FOUND", "攻略不存在");
  return serialized(record as Record<string, unknown>);
}

async function conflictOrMissing(id: string): Promise<never> {
  const exists = await GuideModel.exists({ _id: objectId(id) });
  if (exists) throw new HttpError(409, "REVISION_CONFLICT", "攻略已被其他编辑更新，请保留当前内容并刷新后重试");
  throw new HttpError(404, "NOT_FOUND", "攻略不存在");
}

export async function createGuide(input: unknown): Promise<Guide> {
  await ready();
  const values = guideDraftInputSchema.parse(input);
  const record = await GuideModel.create({ ...values, slug: values.slug || undefined, status: "draft", revision: 1 });
  return serialized(record.toObject() as Record<string, unknown>);
}

export async function listPublishedGuides(): Promise<Guide[]> {
  await ready();
  const records = await GuideModel.find({ status: "published" }).sort({ publishedAt: -1 }).lean();
  return records.map((record) => serialized(record as Record<string, unknown>));
}

export async function listAdminGuides(): Promise<Guide[]> {
  await ready();
  const records = await GuideModel.find({}).sort({ updatedAt: -1 }).lean();
  return records.map((record) => serialized(record as Record<string, unknown>));
}

export async function getGuideById(id: string): Promise<Guide> {
  return findByIdOrThrow(id);
}

export async function getPublishedGuideBySlug(slug: string): Promise<Guide | null> {
  await ready();
  const record = await GuideModel.findOne({ slug, status: "published" }).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function updateGuide(id: string, input: unknown): Promise<Guide> {
  const { expectedRevision, ...patch } = guidePatchSchema.parse(input);
  const current = await findByIdOrThrow(id);
  if (current.revision !== expectedRevision) await conflictOrMissing(id);
  const merged = guideDraftInputSchema.parse({ ...contentOf(current), ...patch });
  if (current.status === "published" && merged.slug !== current.slug) throw new HttpError(400, "PUBLISHED_SLUG_IMMUTABLE", "已发布攻略的 slug 不可修改");

  const setValues: Record<string, unknown> = { ...merged };
  const unsetValues: Record<string, 1> = {};
  if (!merged.slug) { delete setValues.slug; unsetValues.slug = 1; }
  if (!merged.coverImage) { delete setValues.coverImage; unsetValues.coverImage = 1; }
  const record = await GuideModel.findOneAndUpdate(
    { _id: objectId(id), revision: expectedRevision },
    { $set: setValues, ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}), $inc: { revision: 1 } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!record) return conflictOrMissing(id);
  return serialized(record as Record<string, unknown>);
}

function validatePublish(guide: Guide) {
  if (!guide.title || !guide.slug || !guide.destination || !guide.excerpt || !guide.coverImage?.alt || !guide.coverImage.publicUrl || guide.itinerary.length < 1) {
    throw new HttpError(400, "PUBLISH_REQUIREMENTS", "发布前需填写标题、slug、目的地、简介、封面与 alt，并至少包含一天行程");
  }
}

export async function publishGuide(id: string, input: unknown): Promise<Guide> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  const current = await findByIdOrThrow(id);
  if (current.revision !== expectedRevision) await conflictOrMissing(id);
  validatePublish(current);
  const record = await GuideModel.findOneAndUpdate(
    { _id: objectId(id), revision: expectedRevision },
    { $set: { status: "published", publishedAt: new Date() }, $inc: { revision: 1 } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!record) return conflictOrMissing(id);
  return serialized(record as Record<string, unknown>);
}

export async function unpublishGuide(id: string, input: unknown): Promise<Guide> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  await ready();
  const record = await GuideModel.findOneAndUpdate(
    { _id: objectId(id), revision: expectedRevision },
    { $set: { status: "draft" }, $unset: { publishedAt: 1 }, $inc: { revision: 1 } },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!record) return conflictOrMissing(id);
  return serialized(record as Record<string, unknown>);
}

export async function deleteGuide(id: string, input: unknown): Promise<void> {
  const { expectedRevision } = expectedRevisionSchema.parse(input);
  await ready();
  const record = await GuideModel.findOneAndDelete({ _id: objectId(id), revision: expectedRevision });
  if (!record) await conflictOrMissing(id);
}
