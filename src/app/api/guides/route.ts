import { requireAdmin } from "@/auth";
import { logAdminAction } from "@/lib/admin";
import { createGuide, listAdminGuides, listPublishedGuides } from "@/lib/guides";
import { jsonError, PRIVATE_NO_STORE_HEADERS, PUBLIC_NO_STORE_HEADERS, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const admin = url.searchParams.get("scope") === "admin";
    const q = url.searchParams.get("q") ?? undefined;
    if (admin) await requireAdmin(request);
    const summaries = admin ? await listAdminGuides({ q }) : await listPublishedGuides({ q });
    // Preserve the existing HTTP list shape while internal consumers use GuideSummary.
    const guides = summaries.map((guide) => ({ ...guide, itinerary: [], sections: [], sources: [] }));
    const headers = admin ? PRIVATE_NO_STORE_HEADERS : PUBLIC_NO_STORE_HEADERS;
    return Response.json({ guides }, { headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request);
    const guide = await createGuide(await readJson(request));
    logAdminAction(actor, "guide.create", guide.id, null, guide.revision);
    return Response.json({ guide }, { status: 201, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}
