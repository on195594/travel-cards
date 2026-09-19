"use client";

import { useEffect, useMemo, useState } from "react";
import type { GuideSummary } from "@/lib/guides/schema";
import { GuideCard } from "@/components/guide-card";

type Props = {
  initialGuides: GuideSummary[];
  initialQuery?: string;
};

function filterGuides(guides: GuideSummary[], query: string): GuideSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return guides;
  return guides.filter((guide) => guide.title.toLowerCase().includes(q) || guide.destination.toLowerCase().includes(q) || guide.excerpt.toLowerCase().includes(q));
}

export function GuideSearch({ initialGuides, initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [remoteSearch, setRemoteSearch] = useState<{ query: string; guides: GuideSummary[] }>();

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    fetch(`/api/guides?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("search failed");
        return response.json() as Promise<{ guides?: GuideSummary[] }>;
      })
      .then((data) => setRemoteSearch({ query: q, guides: Array.isArray(data.guides) ? data.guides : [] }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteSearch({ query: q, guides: filterGuides(initialGuides, q) });
      });
    return () => controller.abort();
  }, [initialGuides, query]);

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

  const filtered = useMemo(() => remoteSearch?.query === query.trim() ? remoteSearch.guides : filterGuides(initialGuides, query), [initialGuides, query, remoteSearch]);

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
            <p className="eyebrow">旅行灵感 · 实用攻略</p>
            <h1 id="home-hero-title" className="hero-compact-title">
              下一站，<em>去哪里？</em>
            </h1>
            <p className="hero-compact-lede">
              从目的地出发，找到清晰的逐日行程与实用建议。
            </p>
          </div>

          <p className="collection-note">{destinations.length} 个目的地 · 慢慢探索</p>
        </div>

        <div className="search-filter-dock">
          <div className="search-box" role="search" aria-label="攻略搜索">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="搜索目的地或关键词"
              aria-label="搜索攻略"
              aria-controls="guide-results"
              maxLength={200}
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
            <div className="destination-chips" role="group" aria-label="目的地快捷搜索">
              <button
                type="button"
                className={`chip ${!query.trim() ? "active" : ""}`}
                onClick={handleClear}
                aria-pressed={!query.trim()}
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
                    aria-pressed={isActive}
                  >
                    {dest}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="guide-feed-section" id="guide-results" aria-labelledby="guide-list-title">
        <div className="feed-meta-row">
          <h2 id="guide-list-title" className="feed-title">{query.trim() ? "搜索结果" : "发现旅行攻略"}</h2>
          <span className="section-count" role="status" aria-atomic="true">
            {query.trim()
              ? `找到 ${filtered.length} 篇攻略`
              : `共 ${initialGuides.length} 篇攻略`}
          </span>
        </div>

        {filtered.length ? (
          <div className="grid">
            {filtered.map((guide) => (
              <GuideCard key={guide.id} guide={guide} />
            ))}
          </div>
        ) : !initialGuides.length ? (
          <div className="empty"><h3>旅程正在准备中</h3><p>暂时没有已发布攻略，稍后再来发现新的目的地。</p></div>
        ) : (
          <div className="empty search-empty">
            <p>未找到与“<strong>{query}</strong>”相关的旅行攻略。</p>
            <p className="hint">试试城市名称，或换一个简短的关键词。</p>
            <button className="button secondary" type="button" onClick={handleClear}>
              清除搜索关键词
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
