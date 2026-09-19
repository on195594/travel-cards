import { requireAdmin } from "@/auth";
import { reviseGuide } from "@/lib/ai/gemini";
import { reviseGuideInputSchema } from "@/lib/ai/schemas";
import { jsonError, PRIVATE_NO_STORE_HEADERS, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = reviseGuideInputSchema.parse(await readJson(request));
    return Response.json({ result: await reviseGuide(input.existingGuide, input.instruction) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
