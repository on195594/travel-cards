import { z } from "zod";
import {
  guideAnswerSchema,
  guideCandidateSchema,
  itineraryDaySchema,
  sectionSchema,
  sourceRefSchema,
} from "@/lib/guides";

const shortText = z.string().trim().min(1).max(200);
const aiItemSchema = itineraryDaySchema.shape.items.element.strict();
const aiDaySchema = itineraryDaySchema.extend({ items: z.array(aiItemSchema).max(50) }).strict();

function checkDays(value: { days: number; itinerary: Array<{ day: number }> }, context: z.RefinementCtx) {
  const seen = new Set<number>();
  for (const entry of value.itinerary) {
    if (entry.day > value.days) context.addIssue({ code: "custom", path: ["itinerary"], message: "行程日期超出总天数" });
    if (seen.has(entry.day)) context.addIssue({ code: "custom", path: ["itinerary"], message: "行程日期重复" });
    seen.add(entry.day);
  }
}

const aiGuideFields = {
  title: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().min(1).max(1000),
  days: z.number().int().min(1).max(365),
  itinerary: z.array(aiDaySchema).max(365),
  sections: z.array(sectionSchema.strict()).max(50),
  sources: z.array(sourceRefSchema.strict()).max(50),
};

export const aiGuideContextSchema = z.strictObject(aiGuideFields).superRefine(checkDays);

export const generateGuideInputSchema = z.strictObject({
  destination: shortText.optional(),
  days: z.number().int().min(1).max(60).optional(),
  travelDateOrSeason: shortText.optional(),
  budget: z.string().trim().min(1).max(100).optional(),
  travelers: z.string().trim().min(1).max(200).optional(),
  preferences: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
});

export const reviseGuideInputSchema = z.strictObject({
  existingGuide: aiGuideContextSchema,
  instruction: z.string().trim().min(1).max(2000),
});

export const answerGuideInputSchema = z.strictObject({
  existingGuide: aiGuideContextSchema,
  question: z.string().trim().min(1).max(1000),
});

const clarificationSchema = z.strictObject({
  kind: z.literal("clarification"),
  questions: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
});

const modelGuideSchema = z.strictObject({ ...aiGuideFields, sources: z.array(z.unknown()).max(50).optional() }).superRefine(checkDays);
const modelAnswerSchema = z.strictObject({ answer: z.string().trim().min(1).max(10_000), sources: z.array(z.unknown()).max(50).optional() });

export const modelGuideResultSchema = z.union([
  z.strictObject({ kind: z.literal("candidate"), data: modelGuideSchema }),
  clarificationSchema,
]);

export const modelAnswerResultSchema = z.union([
  z.strictObject({ kind: z.literal("candidate"), data: modelAnswerSchema }),
  clarificationSchema,
]);

export function validateGuideCandidate(value: unknown) {
  return guideCandidateSchema.parse(value);
}

export function validateGuideAnswer(value: unknown) {
  return guideAnswerSchema.parse(value);
}

export type GenerateGuideInput = z.infer<typeof generateGuideInputSchema>;
export type AiResult<T> = { kind: "candidate"; data: T } | { kind: "clarification"; questions: string[] };
