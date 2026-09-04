import type { Metadata } from "next";
import { GuideSearch } from "@/components/guide-search";
import { listPublishedGuides } from "@/lib/guides";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

type Props = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { q } = (await searchParams) ?? {};
  const guides = await listPublishedGuides();
  return (
    <div className="home-layout">
      <header className="site-header">
        <div className="container site-header-inner">
          <Link className="brand" href="/" aria-label="旅行卡片首页">
            <strong>旅行卡片</strong>
            <span>TRAVEL CARDS</span>
          </Link>
          <nav className="header-nav" aria-label="快捷导航">
            <span className="header-stat-badge">
              <span className="stat-dot" aria-hidden="true" />
              {guides.length} 篇攻略已核验
            </span>
            <Link className="nav-link" href="/admin/guides">
              管理内容 <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container home-main">
        <GuideSearch key={q ?? "all"} initialGuides={guides} initialQuery={q ?? ""} />
      </main>

      <footer className="site-footer container">
        <span>旅行卡片 · 让攻略更清晰</span>
        <span>资料仅供出行前参考</span>
      </footer>
    </div>
  );
}
