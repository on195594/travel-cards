import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/guides/"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
