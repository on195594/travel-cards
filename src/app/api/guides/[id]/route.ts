import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { deleteGuide, getGuideById, updateGuide } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    return Response.json({ guide: await getGuideById((await context.params).id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const guide = await updateGuide((await context.params).id, await readJson(request));
    revalidatePath("/");
    if (guide.slug) revalidatePath(`/guides/${guide.slug}`);
    return Response.json({ guide });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const deleted = await deleteGuide((await context.params).id, await readJson(request));
    revalidatePath("/");
    if (deleted?.slug) revalidatePath(`/guides/${deleted.slug}`);
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
