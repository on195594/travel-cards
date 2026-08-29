import Link from "next/link";
import type { Guide } from "@/lib/guides";

export function GuideCard({ guide }: { guide: Guide }) {
  return (
    <article className="card">
      {/* Admin-configured R2/custom domains cannot be enumerated at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {guide.coverImage && <img className="card-image" src={guide.coverImage.publicUrl} alt={guide.coverImage.alt} />}
      <div className="card-body">
        <p className="eyebrow">{guide.destination} · {guide.days} 天</p>
        <h2><Link href={`/guides/${guide.slug}`}>{guide.title}</Link></h2>
        <p>{guide.excerpt}</p>
        <Link className="text-link" href={`/guides/${guide.slug}`}>查看攻略 <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
