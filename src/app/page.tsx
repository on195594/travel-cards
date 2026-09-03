import { GuideSearch } from "@/components/guide-search";
import { listPublishedGuides } from "@/lib/guides";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { q } = (await searchParams) ?? {};
  const guides = await listPublishedGuides({ q });
  return (
    <main className="home-page">
      <header className="hero">
        <Image className="hero-image" src="/travel-hero.webp" alt="" fill priority sizes="100vw" />
        <nav className="site-nav" aria-label="主导航">
          <Link className="brand" href="/">旅行卡片 <span>TRAVEL CARDS</span></Link>
          <Link className="nav-link" href="/admin/guides">管理内容 <span aria-hidden="true">↗</span></Link>
        </nav>
        <div className="hero-copy">
          <div>
            <p className="eyebrow">精心整理的中文旅行攻略</p>
            <h1>把下一段旅程，<em>装进一张卡片。</em></h1>
          </div>
          <p className="hero-lede">已核对来源的逐日行程与实用建议，帮你更快做决定。</p>
        </div>
      </header>

      <GuideSearch initialGuides={guides} initialQuery={q ?? ""} />

      <footer className="site-footer container">
        <span>旅行卡片 · 让攻略更清晰</span>
        <span>资料仅供出行前参考</span>
      </footer>
    </main>
  );
}
