"use client";

import { useMemo, useState } from "react";
import type { Guide } from "@/lib/guides";
import { GuideCard } from "@/components/guide-card";

type Props = {
  initialGuides: Guide[];
  initialQuery?: string;
};

export function GuideSearch({ initialGuides, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialGuides;
    return initialGuides.filter((guide) => {
      const title = guide.title.toLowerCase();
      const dest = guide.destination.toLowerCase();
      const excerpt = guide.excerpt.toLowerCase();
      return title.includes(q) || dest.includes(q) || excerpt.includes(q);
    });
  }, [initialGuides, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (value.trim()) {
        url.searchParams.set("q", value.trim());
      } else {
        url.searchParams.delete("q");
      }
      window.history.replaceState(null, "", url.toString());
    }
  }

  function handleClear() {
    handleQueryChange("");
  }

  return (
    <section className="container guide-section" id="guides" aria-labelledby="guide-list-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">精选路线</p>
          <h2 id="guide-list-title">已发布攻略</h2>
        </div>
        <p className="section-count">
          {query.trim()
            ? `找到 ${filtered.length.toString().padStart(2, "0")} 篇匹配`
            : `${initialGuides.length.toString().padStart(2, "0")} 篇可阅读`}
        </p>
      </div>

      <div className="search-bar-wrapper">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true">🔍</span>
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="搜索目的地、攻略标题或关键词（如：王朗、熊猫、3天）..."
            aria-label="搜索攻略"
          />
          {query && (
            <button
              className="search-clear-btn"
              type="button"
              onClick={handleClear}
              aria-label="清除搜索关键词"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {filtered.length ? (
        <div className="grid">
          {filtered.map((guide) => (
            <GuideCard key={guide.id} guide={guide} />
          ))}
        </div>
      ) : (
        <div className="empty search-empty">
          <p>未找到与“<strong>{query}</strong>”相关的旅行攻略。</p>
          <button className="button secondary" type="button" onClick={handleClear}>
            清除搜索关键词
          </button>
        </div>
      )}
    </section>
  );
}
