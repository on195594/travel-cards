import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "旅行卡片", template: "%s | 旅行卡片" },
  description: "结构化中文旅行攻略与分享卡片",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
