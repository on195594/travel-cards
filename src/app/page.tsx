import { GuideCard } from "@/components/guide-card";
import { listPublishedGuides } from "@/lib/guides";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const guides = await listPublishedGuides();
  return (
    <main>
      <header className="hero">
        <nav><strong>旅行卡片</strong><Link href="/admin/guides">管理</Link></nav>
        <div className="hero-copy"><p className="eyebrow">精心整理的中文旅行攻略</p><h1>把下一段旅程，装进一张卡片</h1><p>浏览已核对来源的逐日行程、交通住宿提示与实用建议。</p></div>
      </header>
      <section className="container" aria-labelledby="guide-list-title">
        <h2 id="guide-list-title">已发布攻略</h2>
        {guides.length ? <div className="grid">{guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)}</div> : <p className="empty">暂时没有已发布攻略。</p>}
      </section>
    </main>
  );
}
