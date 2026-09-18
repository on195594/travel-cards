import mongoose, { Schema } from "mongoose";
import { connectDb } from "@/lib/db";
import {
  guideSchema,
  guideSummarySchema,
  type Guide,
  type GuideSummary,
} from "./schema";

const itemMongooseSchema = new Schema(
  {
    time: String,
    place: { type: String, required: true },
    description: { type: String, required: true },
    tips: String,
  },
  { _id: false }
);

const itineraryMongooseSchema = new Schema(
  {
    day: { type: Number, required: true },
    title: { type: String, required: true },
    items: { type: [itemMongooseSchema], default: [] },
  },
  { _id: false }
);

const sectionMongooseSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["transport", "stay", "food", "budget", "safety", "other"],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
  },
  { _id: false }
);

const sourceMongooseSchema = new Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    accessedAt: { type: Date, required: true },
    citedText: String,
  },
  { _id: false }
);

const guideMongooseSchema = new Schema(
  {
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
    slugLocked: { type: Boolean, default: false, select: false },
  },
  { timestamps: true, versionKey: false }
);

guideMongooseSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } }
);
guideMongooseSchema.index({ status: 1, publishedAt: -1 });
guideMongooseSchema.index({ updatedAt: -1 });

const GuideModel =
  mongoose.models.Guide || mongoose.model("Guide", guideMongooseSchema);

function objectId(id: string) {
  return mongoose.isObjectIdOrHexString(id)
    ? new mongoose.Types.ObjectId(id)
    : undefined;
}

async function ready() {
  await connectDb();
  await GuideModel.init();
}

function serialized(record: Record<string, unknown>): Guide {
  return guideSchema.parse({
    ...record,
    id: String(record._id),
    _id: undefined,
    createdAt: new Date(record.createdAt as Date).toISOString(),
    updatedAt: new Date(record.updatedAt as Date).toISOString(),
    publishedAt: record.publishedAt
      ? new Date(record.publishedAt as Date).toISOString()
      : undefined,
    sources: Array.isArray(record.sources)
      ? record.sources.map((source) => ({
          ...(source as Record<string, unknown>),
          accessedAt: new Date(
            (source as Record<string, unknown>).accessedAt as Date
          ).toISOString(),
        }))
      : [],
  });
}

function serializedSummary(record: Record<string, unknown>): GuideSummary {
  return guideSummarySchema.parse({
    ...record,
    id: String(record._id),
    _id: undefined,
    createdAt: new Date(record.createdAt as Date).toISOString(),
    updatedAt: new Date(record.updatedAt as Date).toISOString(),
    publishedAt: record.publishedAt
      ? new Date(record.publishedAt as Date).toISOString()
      : undefined,
  });
}

function searchFilter(q: string | undefined) {
  if (!q) return undefined;
  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return [{ title: regex }, { destination: regex }, { excerpt: regex }];
}

export async function insertGuide(values: Record<string, unknown>): Promise<Guide> {
  await ready();
  const record = await GuideModel.create(values);
  return serialized(record.toObject() as Record<string, unknown>);
}

export async function findGuideById(id: string): Promise<Guide | null> {
  const _id = objectId(id);
  if (!_id) return null;
  await ready();
  const record = await GuideModel.findById(_id).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function findPublishedGuideBySlug(slug: string): Promise<Guide | null> {
  await ready();
  const record = await GuideModel.findOne({ slug, status: "published" }).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function findPublishedGuideSummaries(q: string | undefined, limit: number): Promise<GuideSummary[]> {
  await ready();
  const filter: Record<string, unknown> = { status: "published" };
  const search = searchFilter(q);
  if (search) filter.$or = search;
  const records = await GuideModel.find(filter)
    .select("title slug destination excerpt days coverImage status revision publishedAt createdAt updatedAt")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
  return records.map((record) => serializedSummary(record as Record<string, unknown>));
}

export async function findAdminGuideSummaries(q: string | undefined, limit: number): Promise<GuideSummary[]> {
  await ready();
  const filter: Record<string, unknown> = {};
  const search = searchFilter(q);
  if (search) filter.$or = [...search, { slug: search[0].title }];
  const records = await GuideModel.find(filter)
    .select("title slug destination excerpt days coverImage status revision publishedAt createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
  return records.map((record) => serializedSummary(record as Record<string, unknown>));
}

export async function guideExists(id: string): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  await ready();
  return Boolean(await GuideModel.exists({ _id }));
}

export async function guideSlugIsLocked(id: string): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  await ready();
  return Boolean(await GuideModel.exists({ _id, slugLocked: true }));
}

export async function updateGuideRecord(
  id: string,
  expectedRevision: number,
  setValues: Record<string, unknown>,
  unsetValues: Record<string, 1>
): Promise<Guide | null> {
  const _id = objectId(id);
  if (!_id) return null;
  await ready();
  const record = await GuideModel.findOneAndUpdate(
    { _id, revision: expectedRevision },
    {
      $set: setValues,
      ...(Object.keys(unsetValues).length ? { $unset: unsetValues } : {}),
      $inc: { revision: 1 },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function setGuidePublished(
  id: string,
  expectedRevision: number
): Promise<Guide | null> {
  const _id = objectId(id);
  if (!_id) return null;
  await ready();
  const record = await GuideModel.findOneAndUpdate(
    { _id, revision: expectedRevision },
    {
      $set: { status: "published", publishedAt: new Date(), slugLocked: true },
      $inc: { revision: 1 },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function setGuideUnpublished(
  id: string,
  expectedRevision: number,
  keepSlugLocked: boolean
): Promise<Guide | null> {
  const _id = objectId(id);
  if (!_id) return null;
  await ready();
  const record = await GuideModel.findOneAndUpdate(
    { _id, revision: expectedRevision },
    {
      $set: {
        status: "draft",
        ...(keepSlugLocked ? { slugLocked: true } : {}),
      },
      $unset: { publishedAt: 1 },
      $inc: { revision: 1 },
    },
    { returnDocument: "after", runValidators: true }
  ).lean();
  return record ? serialized(record as Record<string, unknown>) : null;
}

export async function deleteGuideRecord(
  id: string,
  expectedRevision: number
): Promise<{ slug?: string } | null> {
  const _id = objectId(id);
  if (!_id) return null;
  await ready();
  const record = await GuideModel.findOneAndDelete({ _id, revision: expectedRevision }).lean();
  return record ? { slug: record.slug || undefined } : null;
}
