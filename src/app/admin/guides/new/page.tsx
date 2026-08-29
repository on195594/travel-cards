import { requireAdmin } from "@/auth";
import { GuideEditor } from "@/components/guide-editor";

export const dynamic = "force-dynamic";

export default async function NewGuidePage() {
  await requireAdmin();
  return <main className="container admin"><GuideEditor /></main>;
}
