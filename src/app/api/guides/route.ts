import { requireAdmin } from "@/auth";
import { createGuide, listAdminGuides, listPublishedGuides } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const admin = new URL(request.url).searchParams.get("scope") === "admin";
    if (admin) await requireAdmin();
    return Response.json({ guides: admin ? await listAdminGuides() : await listPublishedGuides() });
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
