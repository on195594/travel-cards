import { requireAdminPage } from "@/auth";
import { GuideEditor } from "@/components/guide-editor";

export const dynamic = "force-dynamic";

export default async function NewGuidePage() {
  await requireAdminPage();
  return <main className="container admin"><GuideEditor /></main>;
}
