"use client";

import { useEffect, useRef, useState } from "react";

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    let success = false;
    try {
      await navigator.clipboard.writeText(window.location.href);
      success = true;
    } catch {
      try {
        const input = document.createElement("input");
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        success = document.execCommand("copy");
        document.body.removeChild(input);
      } catch {
        success = false;
      }
    }
    if (success) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  return <button className="secondary" type="button" onClick={copy}>{copied ? "已复制公开链接" : "复制公开链接"}</button>;
}

