import { requireAdmin } from "@/auth";
import { createGuide, listAdminGuides, listPublishedGuides } from "@/lib/guides";
import { jsonError, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const admin = url.searchParams.get("scope") === "admin";
    const q = url.searchParams.get("q") ?? undefined;
    if (admin) await requireAdmin(request);
    const summaries = admin ? await listAdminGuides({ q }) : await listPublishedGuides({ q });
    // Preserve the existing HTTP list shape while internal consumers use GuideSummary.
    const guides = summaries.map((guide) => ({ ...guide, itinerary: [], sections: [], sources: [] }));
    const headers = admin ? undefined : { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
    return Response.json({ guides }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const guide = await createGuide(await readJson(request));
    return Response.json({ guide }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
