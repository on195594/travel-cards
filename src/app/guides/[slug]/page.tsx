import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/copy-link";
import { getPublishedGuideBySlug } from "@/lib/guides";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = await getPublishedGuideBySlug((await params).slug);
  if (!guide) return { title: "攻略不存在" };
  return {
    title: guide.title,
    description: guide.excerpt,
    openGraph: { title: guide.title, description: guide.excerpt, type: "article", images: guide.coverImage ? [{ url: guide.coverImage.publicUrl, alt: guide.coverImage.alt }] : [] },
  };
}

export default async function GuidePage({ params }: Props) {
  const guide = await getPublishedGuideBySlug((await params).slug);
  if (!guide) notFound();
  return (
    <main>
      <header className="detail-hero">
        <nav><Link href="/">← 旅行卡片</Link></nav>
        <p className="eyebrow">{guide.destination} · {guide.days} 天</p>
        <h1>{guide.title}</h1><p>{guide.excerpt}</p><CopyLink />
      </header>
      <article className="article container">
        {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {guide.coverImage && <img className="cover" src={guide.coverImage.publicUrl} alt={guide.coverImage.alt} />}
        <section><h2>逐日行程</h2>{guide.itinerary.map((day) => <div className="day" key={day.day}><h3>第 {day.day} 天 · {day.title}</h3><ol>{day.items.map((item, index) => <li key={`${item.place}-${index}`}><strong>{item.time && `${item.time} · `}{item.place}</strong><p>{item.description}</p>{item.tips && <p className="tip">提示：{item.tips}</p>}</li>)}</ol></div>)}</section>
        {guide.sections.map((section, index) => <section key={`${section.kind}-${index}`}><h2>{section.title}</h2><p className="preline">{section.body}</p></section>)}
        <section><h2>来源</h2>{guide.sources.length ? <ul className="sources">{guide.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>访问于 {new Date(source.accessedAt).toLocaleDateString("zh-CN")}</small>{source.citedText && <p>{source.citedText}</p>}</li>)}</ul> : <p>本攻略未附外部来源。</p>}<p className="warning">旅行政策、开放时间和价格可能变化，请在出发前通过官方渠道复核。</p></section>
      </article>
    </main>
  );
}
