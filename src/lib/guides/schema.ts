import { z } from "zod";

export const httpUrl = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "URL must use http or https");
export const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能包含小写字母、数字和连字符");
export const optionalSlug = z.preprocess((value) => value === "" ? undefined : value, slugSchema.optional());

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

export const draftGuideObject = z.object({
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

export function checkDayNumbers(value: { days: number; itinerary: Array<{ day: number }> }, context: z.RefinementCtx) {
  const seen = new Set<number>();
  for (const entry of value.itinerary) {
    if (entry.day > value.days) context.addIssue({ code: "custom", path: ["itinerary"], message: `第 ${entry.day} 天超出总天数` });
    if (seen.has(entry.day)) context.addIssue({ code: "custom", path: ["itinerary"], message: `第 ${entry.day} 天重复` });
    seen.add(entry.day);
  }
}

export const guideDraftInputSchema = draftGuideObject.superRefine(checkDayNumbers);
export const guideCreateInputSchema = draftGuideObject.extend({
  publish: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
}).superRefine(checkDayNumbers);
export const guideCandidateSchema = draftGuideObject.omit({ slug: true, coverImage: true }).required().superRefine(checkDayNumbers);
export const guideAnswerSchema = z.object({ answer: z.string().trim().min(1), sources: z.array(sourceRefSchema) });

export const guideSchema = draftGuideObject.extend({
  id: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().min(1),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine(checkDayNumbers);

export const guideSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: optionalSlug,
  destination: z.string(),
  excerpt: z.string(),
  days: z.number().int().min(1),
  coverImage: draftGuideObject.shape.coverImage.optional(),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().min(1),
  publishedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const guidePatchSchema = z.object({
  expectedRevision: z.number().int().min(1),
  title: z.string().trim().max(200).optional(),
  slug: optionalSlug,
  destination: z.string().trim().max(200).optional(),
  excerpt: z.string().trim().max(1000).optional(),
  days: z.number().int().min(1).max(365).optional(),
  coverImage: draftGuideObject.shape.coverImage.optional(),
  itinerary: z.array(itineraryDaySchema).optional(),
  sections: z.array(sectionSchema).optional(),
  sources: z.array(sourceRefSchema).optional(),
});
export const expectedRevisionSchema = z.object({ expectedRevision: z.number().int().min(1) });

export const MAX_SEARCH_QUERY_LENGTH = 200;
export type GuideListOptions = { q?: string; limit?: number };

export type Guide = z.infer<typeof guideSchema>;
export type GuideSummary = z.infer<typeof guideSummarySchema>;
export type GuideDraftInput = z.infer<typeof guideDraftInputSchema>;
export type GuideCreateInput = z.infer<typeof guideCreateInputSchema>;
export type GuideCandidate = z.infer<typeof guideCandidateSchema>;
export type GuideAnswer = z.infer<typeof guideAnswerSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type ItineraryDay = z.infer<typeof itineraryDaySchema>;
export type GuideSection = z.infer<typeof sectionSchema>;
