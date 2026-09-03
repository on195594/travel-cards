import Link from "next/link";
import type { Guide } from "@/lib/guides";

export function GuideCard({ guide }: { guide: Guide }) {
  const href = `/guides/${guide.slug}`;
  return (
    <article className="card">
      {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Link className="card-media-link" href={href} aria-label={`查看攻略：${guide.title}`}>{guide.coverImage ? <div className="card-media"><img className="card-image" src={guide.coverImage.publicUrl} alt={guide.coverImage.alt} loading="lazy" decoding="async" /><span className="card-arrow" aria-hidden="true">↗</span></div> : <div className="card-media card-media-empty" aria-hidden="true"><span>TRAVEL<br />NOTE</span></div>}</Link>
      <div className="card-body">
        <div className="card-meta"><p className="eyebrow">{guide.destination}</p><span>{guide.days} 天</span></div>
        <h2><Link href={href}>{guide.title}</Link></h2>
        <p>{guide.excerpt}</p>
        <Link className="text-link" href={href}>查看攻略 <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}
