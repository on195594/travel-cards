import { requireCapability } from "@/auth";
import { logAdminAction } from "@/lib/admin";
import { deleteGuide, getGuideById, updateGuide } from "@/lib/guides";
import { jsonError, PRIVATE_NO_STORE_HEADERS, readJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await requireCapability(request, "guide.read");
    return Response.json({ guide: await getGuideById((await context.params).id) }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request, "guide.update");
    const guide = await updateGuide((await context.params).id, await readJson(request));
    logAdminAction(actor, "guide.update", guide.id, guide.revision - 1, guide.revision);
    return Response.json({ guide }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request, "guide.delete");
    const deleted = await deleteGuide((await context.params).id, await readJson(request));
    logAdminAction(actor, "guide.delete", deleted.id, deleted.revision, null);
    return new Response(null, { status: 204, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
