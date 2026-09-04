import { requireAdmin } from "@/auth";
import { reviseGuide } from "@/lib/ai/gemini";
import { reviseGuideInputSchema } from "@/lib/ai/schemas";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = reviseGuideInputSchema.parse(await readJson(request));
    return Response.json({ result: await reviseGuide(input.existingGuide, input.instruction) });
  } catch (error) {
    return jsonError(error);
  }
}
