import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/env";
import { listPublishedGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const guides = await listPublishedGuides();

  const guideEntries: MetadataRoute.Sitemap = guides
    .filter((guide) => Boolean(guide.slug))
    .map((guide) => ({
      url: `${origin}/guides/${guide.slug}`,
      lastModified: guide.updatedAt ? new Date(guide.updatedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  return [
    {
      url: origin,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    ...guideEntries,
  ];
}
