import type { NextConfig } from "next";

const publicNoStore = [{ key: "Cache-Control", value: "no-store, max-age=0" }];
const privateNoStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];

const nextConfig: NextConfig = {
  cacheComponents: false,
  output: "standalone",
  async headers() {
    return [
      { source: "/", headers: publicNoStore },
      { source: "/guides/:path*", headers: publicNoStore },
      { source: "/sitemap.xml", headers: publicNoStore },
      { source: "/admin/:path*", headers: privateNoStore },
    ];
  },
};

export default nextConfig;
