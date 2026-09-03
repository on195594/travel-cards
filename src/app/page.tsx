import { GuideCard } from "@/components/guide-card";
import { listPublishedGuides } from "@/lib/guides";
import Image from "next/image";
import Link from "next/link";

export const revalidate = 300;

export default async function Home() {
  const guides = await listPublishedGuides();
  return (
    <main className="home-page">
      <header className="hero">
        <Image className="hero-image" src="/travel-hero.webp" alt="" fill priority sizes="100vw" />
        <nav className="site-nav" aria-label="主导航"><Link className="brand" href="/">旅行卡片 <span>TRAVEL CARDS</span></Link><Link className="nav-link" href="/admin/guides">管理内容 <span aria-hidden="true">↗</span></Link></nav>
        <div className="hero-copy"><div><p className="eyebrow">精心整理的中文旅行攻略</p><h1>把下一段旅程，<em>装进一张卡片。</em></h1></div><p className="hero-lede">已核对来源的逐日行程与实用建议，帮你更快做决定。</p></div>
      </header>
      <section className="container guide-section" id="guides" aria-labelledby="guide-list-title">
        <div className="section-heading"><div><p className="eyebrow">精选路线</p><h2 id="guide-list-title">已发布攻略</h2></div><p className="section-count">{guides.length.toString().padStart(2, "0")} 篇可阅读</p></div>
        {guides.length ? <div className="grid">{guides.map((guide) => <GuideCard key={guide.id} guide={guide} />)}</div> : <p className="empty">暂时没有已发布攻略。</p>}
      </section>
      <footer className="site-footer container"><span>旅行卡片 · 让攻略更清晰</span><span>资料仅供出行前参考</span></footer>
    </main>
  );
}
