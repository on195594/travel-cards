import Link from "next/link";
import type { GuideSummary } from "@/lib/guides/schema";

export function GuideCard({ guide }: { guide: GuideSummary }) {
  const href = `/guides/${guide.slug}`;
  return (
    <article className="card">
      <Link className="card-link" href={href} aria-labelledby={`guide-title-${guide.id}`}>
        {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {guide.coverImage ? <div className="card-media"><img className="card-image" src={guide.coverImage.publicUrl} alt={guide.coverImage.alt} loading="lazy" decoding="async" /></div> : <div className="card-media card-media-empty" aria-hidden="true"><span>旅行手记</span></div>}
        <div className="card-body">
          <div className="card-meta"><p className="eyebrow">{guide.destination}</p><span>{guide.days} 天</span></div>
          <h3 id={`guide-title-${guide.id}`}>{guide.title}</h3>
          <p>{guide.excerpt}</p>
          <span className="card-cta">查看行程 <span aria-hidden="true">→</span></span>
        </div>
      </Link>
    </article>
  );
}
