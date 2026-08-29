import { requireAdmin } from "@/auth";
import { publishGuide } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    return Response.json({ guide: await publishGuide((await params).id, await readJson(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
