import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { publishGuide } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const guide = await publishGuide((await params).id, await readJson(request));
    revalidatePath("/");
    if (guide.slug) revalidatePath(`/guides/${guide.slug}`);
    return Response.json({ guide });
  } catch (error) {
    return jsonError(error);
  }
}
