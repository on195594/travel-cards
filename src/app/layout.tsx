import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSiteOrigin } from "@/lib/env";
import "./globals.css";

const themeScript = `(()=>{try{const saved=localStorage.getItem("travel-cards-theme");const dark=saved?saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=dark?"dark":"light"}catch{}})()`;

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: { default: "旅行卡片", template: "%s | 旅行卡片" },
  description: "结构化中文旅行攻略与分享卡片，已核对来源的逐日行程与实用建议",
  openGraph: {
    siteName: "旅行卡片",
    locale: "zh_CN",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><a className="skip-link" href="#main-content">跳到主要内容</a>{children}<ThemeToggle /></body></html>;
}
