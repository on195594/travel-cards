import { requireAdmin } from "@/auth";
import { GuideEditor } from "@/components/guide-editor";
import { getGuideById } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function EditGuidePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const guide = await getGuideById((await params).id);
  return <main className="container admin"><GuideEditor initialGuide={guide} /></main>;
}
