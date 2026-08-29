"use client";
/* eslint-disable @next/next/no-img-element -- preview supports the configured R2/custom domain */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Guide, GuideDraftInput } from "@/lib/guides";

const blank: GuideDraftInput = { title: "", destination: "", excerpt: "", days: 1, itinerary: [{ day: 1, title: "", items: [{ place: "", description: "" }] }], sections: [], sources: [] };

function contentOf(guide: Guide): GuideDraftInput {
  return { title: guide.title, slug: guide.slug, destination: guide.destination, excerpt: guide.excerpt, days: guide.days, coverImage: guide.coverImage, itinerary: guide.itinerary, sections: guide.sections, sources: guide.sources };
}

export function GuideEditor({ initialGuide }: { initialGuide?: Guide }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialGuide);
  const [draft, setDraft] = useState<GuideDraftInput>(initialGuide ? contentOf(initialGuide) : blank);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function field<K extends keyof GuideDraftInput>(key: K, value: GuideDraftInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setDays(days: number) {
    const count = Math.max(1, Math.min(365, days || 1));
    setDraft((current) => ({
      ...current,
      days: count,
      itinerary: Array.from({ length: count }, (_, index) => current.itinerary[index] ?? { day: index + 1, title: "", items: [{ place: "", description: "" }] }).map((day, index) => ({ ...day, day: index + 1 })),
    }));
  }

  function setDay(dayIndex: number, key: "title", value: string) {
    field("itinerary", draft.itinerary.map((day, index) => index === dayIndex ? { ...day, [key]: value } : day));
  }

  function setItem(dayIndex: number, itemIndex: number, key: "time" | "place" | "description" | "tips", value: string) {
    field("itinerary", draft.itinerary.map((day, index) => index === dayIndex ? { ...day, items: day.items.map((item, inner) => inner === itemIndex ? { ...item, [key]: value } : item) } : day));
  }

  async function request(url: string, options: RequestInit): Promise<Guide | undefined> {
    const response = await fetch(url, { ...options, headers: { "content-type": "application/json" } });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (response.status === 409) setMessage("保存冲突：服务器已有更新。当前表单内容已保留，请另行复制后刷新页面再合并。");
      else setMessage(data?.error?.message ?? "请求失败，请重试。");
      return undefined;
    }
    return data?.guide;
  }

  async function save(): Promise<Guide | undefined> {
    setBusy(true); setMessage("");
    try {
      const body = saved ? { ...draft, expectedRevision: saved.revision } : draft;
      const guide = await request(saved ? `/api/guides/${saved.id}` : "/api/guides", { method: saved ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (!guide) return undefined;
      setSaved(guide); setDraft(contentOf(guide)); setMessage("已保存。");
      if (!saved) router.replace(`/admin/guides/${guide.id}`);
      router.refresh();
      return guide;
    } finally { setBusy(false); }
  }

  async function transition(action: "publish" | "unpublish") {
    const current = await save();
    if (!current) return;
    setBusy(true); setMessage("");
    try {
      const guide = await request(`/api/guides/${current.id}/${action}`, { method: "POST", body: JSON.stringify({ expectedRevision: current.revision }) });
      if (guide) { setSaved(guide); setDraft(contentOf(guide)); setMessage(action === "publish" ? "已发布。" : "已撤回为草稿。"); router.refresh(); }
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!saved || !window.confirm("确定删除这篇攻略？此操作无法撤销。")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/guides/${saved.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: saved.revision }) });
      if (response.ok) router.push("/admin/guides");
      else { const data = await response.json(); setMessage(data?.error?.message ?? "删除失败。"); }
    } finally { setBusy(false); }
  }

  return (
    <>
      <header className="admin-header"><div><Link href="/admin/guides">← 攻略列表</Link><h1>{saved ? "编辑攻略" : "新建攻略"}</h1>{saved && <p><span className={`status ${saved.status}`}>{saved.status === "published" ? "已发布" : "草稿"}</span> revision {saved.revision}</p>}</div><div className="actions"><button type="button" disabled={busy} onClick={save}>保存</button>{saved?.status === "published" ? <button className="secondary" type="button" disabled={busy} onClick={() => transition("unpublish")}>撤回</button> : <button type="button" disabled={busy} onClick={() => transition("publish")}>发布</button>}{saved && <button className="danger" type="button" disabled={busy} onClick={remove}>删除</button>}</div></header>
      {message && <p className={message.includes("冲突") || message.includes("失败") || message.includes("需填写") ? "error" : "success"} role="status">{message}</p>}
      <div className="editor-layout">
        <form className="panel editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <section><h2>基本信息</h2><div className="form-grid"><label className="wide">标题<input value={draft.title} onChange={(event) => field("title", event.target.value)} /></label><label>Slug<input value={draft.slug ?? ""} onChange={(event) => field("slug", event.target.value)} placeholder="hangzhou-weekend" /></label><label>目的地<input value={draft.destination} onChange={(event) => field("destination", event.target.value)} /></label><label>天数<input type="number" min="1" max="365" value={draft.days} onChange={(event) => setDays(Number(event.target.value))} /></label><label className="wide">简介<textarea value={draft.excerpt} onChange={(event) => field("excerpt", event.target.value)} /></label></div></section>
          <section><h2>封面图片元数据</h2><p className="hint">Phase 1 直接填写已存在的公开图片；上传将在 R2 阶段接入。</p><div className="form-grid"><label>对象键<input value={draft.coverImage?.objectKey ?? ""} onChange={(event) => field("coverImage", { objectKey: event.target.value, publicUrl: draft.coverImage?.publicUrl ?? "", alt: draft.coverImage?.alt ?? "" })} /></label><label>公开 URL<input type="url" value={draft.coverImage?.publicUrl ?? ""} onChange={(event) => field("coverImage", { objectKey: draft.coverImage?.objectKey ?? "", publicUrl: event.target.value, alt: draft.coverImage?.alt ?? "" })} /></label><label className="wide">替代文本（发布必填）<input value={draft.coverImage?.alt ?? ""} onChange={(event) => field("coverImage", { objectKey: draft.coverImage?.objectKey ?? "", publicUrl: draft.coverImage?.publicUrl ?? "", alt: event.target.value })} /></label></div></section>
          <section><h2>逐日行程</h2>{draft.itinerary.map((day, dayIndex) => <fieldset key={day.day}><legend>第 {day.day} 天</legend><label>当日标题<input value={day.title} onChange={(event) => setDay(dayIndex, "title", event.target.value)} /></label>{day.items.map((item, itemIndex) => <div className="item-grid" key={itemIndex}><label>时间<input value={item.time ?? ""} onChange={(event) => setItem(dayIndex, itemIndex, "time", event.target.value)} /></label><label>地点<input value={item.place} onChange={(event) => setItem(dayIndex, itemIndex, "place", event.target.value)} /></label><label className="wide">说明<textarea value={item.description} onChange={(event) => setItem(dayIndex, itemIndex, "description", event.target.value)} /></label><label className="wide">提示<input value={item.tips ?? ""} onChange={(event) => setItem(dayIndex, itemIndex, "tips", event.target.value)} /></label>{day.items.length > 1 && <button className="text-button" type="button" onClick={() => field("itinerary", draft.itinerary.map((entry, index) => index === dayIndex ? { ...entry, items: entry.items.filter((_, inner) => inner !== itemIndex) } : entry))}>移除此项</button>}</div>)}<button className="secondary" type="button" onClick={() => field("itinerary", draft.itinerary.map((entry, index) => index === dayIndex ? { ...entry, items: [...entry.items, { place: "", description: "" }] } : entry))}>添加地点</button></fieldset>)}</section>
          <section><h2>实用章节</h2>{draft.sections.map((section, index) => <fieldset key={index}><div className="form-grid"><label>类型<select value={section.kind} onChange={(event) => field("sections", draft.sections.map((entry, inner) => inner === index ? { ...entry, kind: event.target.value as typeof entry.kind } : entry))}><option value="transport">交通</option><option value="stay">住宿</option><option value="food">餐饮</option><option value="budget">预算</option><option value="safety">安全</option><option value="other">其他</option></select></label><label>标题<input value={section.title} onChange={(event) => field("sections", draft.sections.map((entry, inner) => inner === index ? { ...entry, title: event.target.value } : entry))} /></label><label className="wide">正文<textarea value={section.body} onChange={(event) => field("sections", draft.sections.map((entry, inner) => inner === index ? { ...entry, body: event.target.value } : entry))} /></label></div><button className="text-button" type="button" onClick={() => field("sections", draft.sections.filter((_, inner) => inner !== index))}>移除章节</button></fieldset>)}<button className="secondary" type="button" onClick={() => field("sections", [...draft.sections, { kind: "other", title: "", body: "" }])}>添加章节</button></section>
          <section><h2>来源</h2>{draft.sources.map((source, index) => <fieldset key={index}><div className="form-grid"><label>标题<input value={source.title} onChange={(event) => field("sources", draft.sources.map((entry, inner) => inner === index ? { ...entry, title: event.target.value } : entry))} /></label><label>URL<input type="url" value={source.url} onChange={(event) => field("sources", draft.sources.map((entry, inner) => inner === index ? { ...entry, url: event.target.value } : entry))} /></label><label>访问时间<input type="datetime-local" value={source.accessedAt.slice(0, 16)} onChange={(event) => field("sources", draft.sources.map((entry, inner) => inner === index ? { ...entry, accessedAt: event.target.value ? new Date(event.target.value).toISOString() : "" } : entry))} /></label><label className="wide">引用内容<textarea value={source.citedText ?? ""} onChange={(event) => field("sources", draft.sources.map((entry, inner) => inner === index ? { ...entry, citedText: event.target.value } : entry))} /></label></div><button className="text-button" type="button" onClick={() => field("sources", draft.sources.filter((_, inner) => inner !== index))}>移除来源</button></fieldset>)}<button className="secondary" type="button" onClick={() => field("sources", [...draft.sources, { title: "", url: "", accessedAt: new Date().toISOString() }])}>添加来源</button></section>
          <button type="submit" disabled={busy}>保存攻略</button>
        </form>
        <aside className="panel preview" aria-labelledby="preview-title"><p className="eyebrow">实时预览</p><h2 id="preview-title">{draft.title || "未命名攻略"}</h2><p>{draft.destination || "目的地"} · {draft.days} 天</p>{draft.coverImage?.publicUrl && <img src={draft.coverImage.publicUrl} alt={draft.coverImage.alt || "封面预览（尚未填写替代文本）"} />}<p>{draft.excerpt || "攻略简介会显示在这里。"}</p>{draft.itinerary.map((day) => <div key={day.day}><h3>第 {day.day} 天 · {day.title || "未填写"}</h3><ul>{day.items.map((item, index) => <li key={index}>{item.time && `${item.time} · `}{item.place || "未填写地点"}</li>)}</ul></div>)}</aside>
      </div>
    </>
  );
}
