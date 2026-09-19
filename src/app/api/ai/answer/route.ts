import { requireAdmin } from "@/auth";
import { answerGuideQuestion } from "@/lib/ai/gemini";
import { answerGuideInputSchema } from "@/lib/ai/schemas";
import { jsonError, PRIVATE_NO_STORE_HEADERS, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = answerGuideInputSchema.parse(await readJson(request));
    return Response.json({ result: await answerGuideQuestion(input.existingGuide, input.question) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
