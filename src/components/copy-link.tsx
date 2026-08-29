"use client";

import { useState } from "react";

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }
  return <button className="secondary" type="button" onClick={copy}>{copied ? "已复制" : "复制公开链接"}</button>;
}
