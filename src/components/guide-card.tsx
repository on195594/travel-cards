import Link from "next/link";
import type { GuideSummary } from "@/lib/guides/schema";
import { imageSrcSet } from "@/lib/storage/image-srcset";

export function GuideCard({ guide, priority = false }: { guide: GuideSummary; priority?: boolean }) {
  const href = `/guides/${guide.slug}`;
  return (
    <article className="card">
      <Link className="card-link" href={href} aria-labelledby={`guide-title-${guide.id}`}>
        {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {guide.coverImage ? <div className="card-media"><img className="card-image" src={guide.coverImage.publicUrl} srcSet={imageSrcSet(guide.coverImage)} sizes="(max-width: 540px) calc(100vw - 2rem), (max-width: 760px) calc((100vw - 3rem) / 2), (max-width: 1020px) calc((100vw - 3.5rem) / 2), (max-width: 1212px) calc((100vw - 5rem) / 3), 378px" alt={guide.coverImage.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" /></div> : <div className="card-media card-media-empty" aria-hidden="true"><span className="eyebrow">旅行手记</span><span className="card-media-destination">{guide.destination}</span></div>}
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
