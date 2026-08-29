import Link from "next/link";
import { requireAdminPage, signOut } from "@/auth";
import { listAdminGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function AdminGuidesPage() {
  await requireAdminPage();
  const guides = await listAdminGuides();
  return (
    <main className="container admin">
      <header className="admin-header"><div><p className="eyebrow">内容管理</p><h1>旅行攻略</h1></div><div className="actions"><Link className="button" href="/admin/guides/new">新建攻略</Link><form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="secondary" type="submit">退出</button></form></div></header>
      {guides.length ? <div className="admin-list">{guides.map((guide) => <article key={guide.id}><div><span className={`status ${guide.status}`}>{guide.status === "published" ? "已发布" : "草稿"}</span><h2><Link href={`/admin/guides/${guide.id}`}>{guide.title || "未命名攻略"}</Link></h2><p>{guide.destination || "未填写目的地"} · revision {guide.revision}</p></div><Link className="text-link" href={`/admin/guides/${guide.id}`}>编辑</Link></article>)}</div> : <p className="empty">还没有攻略，先新建一篇。</p>}
    </main>
  );
}
