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

  const destinations = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const guide of initialGuides) {
      const dest = guide.destination?.trim();
      if (dest && !seen.has(dest)) {
        seen.add(dest);
        list.push(dest);
      }
    }
    return list;
  }, [initialGuides]);

  const totalDays = useMemo(() => {
    return initialGuides.reduce((sum, g) => sum + (g.days || 1), 0);
  }, [initialGuides]);

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
    <div className="guide-search-flow" id="guides">
      <section className="home-hero-compact" aria-labelledby="home-hero-title">
        <div className="hero-compact-header">
          <div className="hero-text-col">
            <p className="eyebrow">结构化中文旅行指南 · 官方核验</p>
            <h1 id="home-hero-title" className="hero-compact-title">
              把下一段旅程，<em>装进一张卡片。</em>
            </h1>
            <p className="hero-compact-lede">
              逐日行程节点、官方核验来源与实用建议，拒绝冗长种草流水账。
            </p>
          </div>

          <div className="hero-stats-panel" aria-label="数据概览">
            <div className="stat-card">
              <span className="stat-value">{initialGuides.length.toString().padStart(2, "0")}</span>
              <span className="stat-name">精编路线</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{destinations.length.toString().padStart(2, "0")}</span>
              <span className="stat-name">收录地区</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{totalDays.toString().padStart(2, "0")}</span>
              <span className="stat-name">规划天数</span>
            </div>
          </div>
        </div>

        <div className="search-filter-dock">
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="搜索目的地、路线标题或关键词（如：王朗、中秋、3天）..."
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

          {destinations.length > 0 && (
            <div className="destination-chips" role="group" aria-label="目的地快速筛选">
              <span className="chips-label">快速筛选：</span>
              <button
                type="button"
                className={`chip ${!query.trim() ? "active" : ""}`}
                onClick={handleClear}
              >
                全部路线
              </button>
              {destinations.map((dest) => {
                const isActive = query.trim().toLowerCase() === dest.toLowerCase();
                return (
                  <button
                    key={dest}
                    type="button"
                    className={`chip ${isActive ? "active" : ""}`}
                    onClick={() => handleQueryChange(isActive ? "" : dest)}
                  >
                    {dest}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="guide-feed-section" aria-labelledby="guide-list-title">
        <div className="feed-meta-row">
          <h2 id="guide-list-title" className="feed-title">探索精选路线</h2>
          <span className="section-count">
            {query.trim()
              ? `找到 ${filtered.length.toString().padStart(2, "0")} 篇匹配`
              : `${initialGuides.length.toString().padStart(2, "0")} 篇可阅读`}
          </span>
        </div>

        {filtered.length ? (
          <div className="grid">
            {filtered.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        ) : !initialGuides.length ? (
          <p className="empty">暂时没有已发布攻略。</p>
        ) : (
          <div className="empty search-empty">
            <p>未找到与“<strong>{query}</strong>”相关的旅行攻略。</p>
            <button className="button secondary" type="button" onClick={handleClear}>
              清除搜索关键词
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
