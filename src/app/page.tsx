import type { Metadata } from "next";
import { GuideSearch } from "@/components/guide-search";
import { listPublishedDestinations, listPublishedGuides } from "@/lib/guides";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

type Props = {
  searchParams?: Promise<{ q?: string | string[] }>;
};

export default async function Home({ searchParams }: Props) {
  const { q } = (await searchParams) ?? {};
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const [guideResult, destinationResult] = await Promise.allSettled([
    listPublishedGuides({ q: query }),
    query ? listPublishedDestinations() : undefined,
  ]);
  if (guideResult.status === "rejected" && !query) throw guideResult.reason;
  const guides = guideResult.status === "fulfilled" ? guideResult.value : [];
  const destinations = destinationResult.status === "fulfilled" ? destinationResult.value : undefined;
  const searchFailed = guideResult.status === "rejected" || destinationResult.status === "rejected";
  return (
    <div className="home-layout">
      <header className="site-header">
        <div className="container site-header-inner">
          <Link className="brand" href="/" aria-label="旅行卡片首页">
            <strong>旅行卡片</strong>
            <span>TRAVEL CARDS</span>
          </Link>
          <nav className="header-nav" aria-label="快捷导航">
            <Link className="nav-link" href="/admin/guides">
              管理内容 <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" className="container home-main">
        <GuideSearch key={query} initialGuides={guides} initialQuery={query} initialSearchFailed={searchFailed} destinations={destinations} />
      </main>

      <footer className="site-footer container">
        <span>旅行卡片 · 让攻略更清晰</span>
        <span>资料仅供出行前参考</span>
      </footer>
    </div>
  );
}
