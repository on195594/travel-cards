import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import "./globals.css";

const themeScript = `(()=>{try{const saved=localStorage.getItem("travel-cards-theme");const dark=saved?saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=dark?"dark":"light"}catch{}})()`;

export const metadata: Metadata = {
  title: { default: "旅行卡片", template: "%s | 旅行卡片" },
  description: "结构化中文旅行攻略与分享卡片",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><ThemeToggle />{children}</body></html>;
}
