import { requireAdmin } from "@/auth";
import { generateGuideDraft } from "@/lib/ai/gemini";
import { generateGuideInputSchema } from "@/lib/ai/schemas";
import { jsonError, PRIVATE_NO_STORE_HEADERS, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = generateGuideInputSchema.parse(await readJson(request));
    return Response.json({ result: await generateGuideDraft(input) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
