import { requireAdmin } from "@/auth";
import { logAdminAction } from "@/lib/admin";
import { unpublishGuide } from "@/lib/guides";
import { jsonError, PRIVATE_NO_STORE_HEADERS, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin(request);
    const guide = await unpublishGuide((await params).id, await readJson(request));
    logAdminAction(actor, "guide.unpublish", guide.id, guide.revision - 1, guide.revision);
    return Response.json({ guide }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
