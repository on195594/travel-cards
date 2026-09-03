import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { getPublishedGuideBySlug } from "@/lib/guides";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const sectionKindLabels: Record<string, string> = {
  transport: "交通出行",
  stay: "住宿推荐",
  food: "餐饮美食",
  budget: "费用预算",
  safety: "安全防范",
  other: "实用建议",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getPublishedGuideBySlug((await params).slug);
  if (!guide) return { title: "攻略不存在" };
  const images = guide.coverImage ? [{ url: guide.coverImage.publicUrl, alt: guide.coverImage.alt }] : [];
  return {
    title: guide.title,
    description: guide.excerpt,
    openGraph: {
      title: guide.title,
      description: guide.excerpt,
      type: "article",
      publishedTime: guide.publishedAt,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.excerpt,
      images: guide.coverImage ? [guide.coverImage.publicUrl] : [],
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = await getPublishedGuideBySlug((await params).slug);
  if (!guide) notFound();
  return (
    <main>
      <header className="detail-hero">
        <nav className="site-nav" aria-label="详情页导航"><Link className="brand" href="/">旅行卡片 <span>TRAVEL CARDS</span></Link><Link className="nav-link" href="/">← 返回路线</Link></nav>
        <div className="detail-heading"><p className="eyebrow">{guide.destination} <span aria-hidden="true">·</span> {guide.days} 天</p><h1>{guide.title}</h1><p className="hero-lede">{guide.excerpt}</p><CopyLink /></div>
      </header>
      <article className="article container">
        {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {guide.coverImage && <img className="cover" src={guide.coverImage.publicUrl} alt={guide.coverImage.alt} />}
        <section><p className="eyebrow">DAY BY DAY</p><h2>逐日行程</h2>{guide.itinerary.map((day) => <div className="day" key={day.day}><div className="day-number">{String(day.day).padStart(2, "0")}</div><div><h3>{day.title}</h3><ol className="timeline-list">{day.items.map((item, index) => <li className="timeline-item" key={`${item.place}-${index}`}><div className="timeline-header">{item.time && <span className="time-badge">{item.time}</span>}<strong className="place-name">{item.place}</strong></div><p>{item.description}</p>{item.tips && <p className="tip">提示：{item.tips}</p>}</li>)}</ol></div></div>)}</section>
        {guide.sections.map((section, index) => <section className="section-block" key={`${section.kind}-${index}`}><div className="section-badge-wrapper"><span className={`kind-badge kind-${section.kind}`}>{sectionKindLabels[section.kind] ?? "实用建议"}</span></div><h2>{section.title}</h2><p className="preline">{section.body}</p></section>)}
        <section className="section-block"><div className="section-badge-wrapper"><span className="kind-badge">参考来源</span></div><h2>参考资料与官方来源</h2>{guide.sources.length ? <ul className="sources-list">{guide.sources.map((source, index) => <li className="source-card" key={`${source.url}-${index}`}><a className="source-title" href={source.url} target="_blank" rel="noreferrer">{source.title} <span aria-hidden="true">↗</span></a><small className="source-meta">访问于 {new Date(source.accessedAt).toLocaleDateString("zh-CN")}</small>{source.citedText && <blockquote className="source-quote">{source.citedText}</blockquote>}</li>)}</ul> : <p>本攻略未附外部来源。</p>}<p className="warning">旅行政策、开放时间和价格可能变化，请在出发前通过官方渠道复核。</p></section>
        <div className="detail-footer-actions"><Link className="button secondary" href="/">← 返回全部攻略</Link><CopyLink /></div>
      </article>
      <footer className="site-footer container"><span>旅行卡片 · 让攻略更清晰</span><span>资料仅供出行前参考</span></footer>
    </main>
  );
}

