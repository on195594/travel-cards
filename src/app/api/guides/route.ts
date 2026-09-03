import { requireAdmin } from "@/auth";
import { createGuide, listAdminGuides, listPublishedGuides } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("scope") === "admin";
    if (admin) await requireAdmin();
    const guides = admin ? await listAdminGuides() : await listPublishedGuides();
    const headers = admin ? undefined : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
    return Response.json({ guides }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const guide = await createGuide(await readJson(request));
    return Response.json({ guide }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
