import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { deleteGuide, getGuideById, updateGuide } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireAdmin();
    return Response.json({ guide: await getGuideById((await context.params).id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    await requireAdmin();
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
    await requireAdmin();
    await deleteGuide((await context.params).id, await readJson(request));
    revalidatePath("/");
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
