"use client";
/* eslint-disable @next/next/no-img-element -- preview supports the configured R2/custom domain */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Guide, GuideAnswer, GuideCandidate, GuideDraftInput, SourceRef } from "@/lib/guides/schema";

const blank: GuideDraftInput = {
  title: "",
  destination: "",
  excerpt: "",
  days: 1,
  itinerary: [{ day: 1, title: "", items: [{ place: "", description: "" }] }],
  sections: [],
  sources: [],
};

function contentOf(guide: Guide): GuideDraftInput {
  return {
    title: guide.title,
    slug: guide.slug,
    destination: guide.destination,
    excerpt: guide.excerpt,
    days: guide.days,
    coverImage: guide.coverImage,
    itinerary: guide.itinerary,
    sections: guide.sections,
    sources: guide.sources,
  };
}

export function mergeSavedSnapshot(
  current: GuideDraftInput,
  sent: GuideDraftInput,
  saved: Guide
): GuideDraftInput {
  const merged = contentOf(saved);
  for (const key of new Set([
    ...Object.keys(sent),
    ...Object.keys(current),
  ]) as Set<keyof GuideDraftInput>) {
    if (JSON.stringify(current[key]) !== JSON.stringify(sent[key])) {
      (merged as Record<string, unknown>)[key] = current[key];
    }
  }
  return merged;
}

type BooleanRef = { current: boolean };

export function claimGuideWrite(inFlight: BooleanRef, unknown: BooleanRef, blockOnUnknown: boolean) {
  if (inFlight.current || (blockOnUnknown && unknown.current)) return false;
  inFlight.current = true;
  return true;
}

export function markGuideWriteUnknown(unknown: BooleanRef) {
  unknown.current = true;
}

export async function saveThenPublish<T, R>(
  save: () => Promise<T | undefined>,
  publish: (saved: T) => Promise<R>
): Promise<R | undefined> {
  const saved = await save();
  return saved === undefined ? undefined : publish(saved);
}

function AiSources({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  return (
    <ul>
      {sources.map((source) => (
        <li key={`${source.url}-${source.accessedAt}`}>
          <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
          {" · "}<time dateTime={source.accessedAt}>{new Date(source.accessedAt).toLocaleString("zh-CN")}</time>
          {source.citedText && <p>{source.citedText}</p>}
        </li>
      ))}
    </ul>
  );
}

function aiContentOf(guide: GuideDraftInput): GuideCandidate {
  return {
    title: guide.title,
    destination: guide.destination,
    excerpt: guide.excerpt,
    days: guide.days,
    itinerary: guide.itinerary,
    sections: guide.sections,
    sources: guide.sources,
  };
}

export function GuideEditor({ initialGuide }: { initialGuide?: Guide }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialGuide);
  const [draft, setDraft] = useState<GuideDraftInput>(initialGuide ? contentOf(initialGuide) : blank);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [freezeEditor, setFreezeEditor] = useState(false);
  const [unknownWrite, setUnknownWrite] = useState(false);
  const isSubmittingRef = useRef(false);
  const unknownWriteRef = useRef(false);

  const [candidate, setCandidate] = useState<GuideCandidate>();
  const [answer, setAnswer] = useState<GuideAnswer>();
  const [questions, setQuestions] = useState<string[]>([]);
  const [travelTime, setTravelTime] = useState("");
  const [budget, setBudget] = useState("");
  const [travelers, setTravelers] = useState("");
  const [preferences, setPreferences] = useState("");
  const [instruction, setInstruction] = useState("");
  const [question, setQuestion] = useState("");

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

  type GuideRequestResult =
    | { kind: "ok"; guide: Guide }
    | { kind: "error" }
    | { kind: "unknown" };

  function beginOperation(blockOnUnknownWrite = false) {
    if (!claimGuideWrite(isSubmittingRef, unknownWriteRef, blockOnUnknownWrite)) return false;
    setBusy(true);
    setMessage("");
    return true;
  }

  function finishOperation() {
    isSubmittingRef.current = false;
    setBusy(false);
    setFreezeEditor(false);
  }

  async function request(url: string, options: RequestInit): Promise<GuideRequestResult> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          setMessage("保存冲突：服务器已有更新。当前表单内容已保留，请另行复制后刷新页面再合并。");
        } else {
          setMessage(data?.error?.message ?? "请求失败，请重试。");
        }
        return { kind: "error" };
      }
      return data?.guide ? { kind: "ok", guide: data.guide } : { kind: "unknown" };
    } catch {
      return { kind: "unknown" };
    }
  }

  async function markUnknown(operation: string, guideId?: string) {
    markGuideWriteUnknown(unknownWriteRef);
    setUnknownWrite(true);
    let observed = "";
    if (guideId) {
      try {
        const response = await fetch(`/api/guides/${guideId}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5_000),
        });
        if (response.status === 404) {
          observed = "只读核对：服务端当前已无此攻略。";
        } else if (response.ok) {
          const data = await response.json();
          if (data?.guide) {
            observed = `只读核对：服务端当前为${data.guide.status === "published" ? "已发布" : "草稿"}，版本 ${data.guide.revision}。`;
          }
        }
      } catch {}
    }
    setMessage(`${operation}结果未知，请勿直接重试。${observed}请刷新页面并核对列表后再继续。`);
  }

  async function saveSnapshot(announce: boolean): Promise<Guide | undefined> {
    const snapshot = draft;
    const previous = saved;
    const body = previous ? { ...snapshot, expectedRevision: previous.revision } : snapshot;
    const result = await request(previous ? `/api/guides/${previous.id}` : "/api/guides", {
      method: previous ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
    if (result.kind === "unknown") {
      await markUnknown("保存", previous?.id);
      return undefined;
    }
    if (result.kind === "error") return undefined;

    const guide = result.guide;
    setSaved(guide);
    setDraft((current) => mergeSavedSnapshot(current, snapshot, guide));
    if (announce) setMessage("已保存。");
    if (!previous) router.replace(`/admin/guides/${guide.id}`);
    router.refresh();
    return guide;
  }

  async function save(): Promise<Guide | undefined> {
    if (!beginOperation(true)) return undefined;
    try {
      return await saveSnapshot(true);
    } finally {
      finishOperation();
    }
  }

  async function transition(action: "publish" | "unpublish") {
    if (!beginOperation(true)) return;
    if (action === "publish") setFreezeEditor(true);
    const applyTransition = async (current: Guide) => {
      const result = await request(`/api/guides/${current.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: current.revision }),
      });
      if (result.kind === "unknown") {
        await markUnknown(action === "publish" ? "保存已成功，但发布" : "撤回", current.id);
        return;
      }
      if (result.kind === "error") {
        if (action === "publish") {
          setMessage((previous) => `攻略已保存，但发布失败：${previous || "请检查必填项。"}`);
        }
        return;
      }

      setSaved(result.guide);
      if (action === "publish") {
        setDraft((currentDraft) => ({ ...currentDraft, slug: result.guide.slug }));
      }
      setMessage(action === "publish" ? "已发布。" : "已撤回为草稿；表单中的未保存内容仍保留。");
      router.refresh();
    };

    try {
      if (action === "publish") {
        await saveThenPublish(() => saveSnapshot(false), applyTransition);
      } else if (saved) {
        await applyTransition(saved);
      }
    } finally {
      finishOperation();
    }
  }

  async function uploadCover(file: File | undefined) {
    if (!file || !beginOperation()) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? "图片上传失败，请重试。");
        return;
      }
      setDraft((current) => ({
        ...current,
        coverImage: {
          objectKey: data.objectKey,
          publicUrl: data.publicUrl,
          alt: current.coverImage?.alt ?? "",
        },
      }));
      setMessage("封面图片已上传；保存攻略后生效。");
    } catch {
      setMessage("图片上传结果未知，请勿直接重试；请先在对象存储中核对。");
    } finally {
      finishOperation();
    }
  }

  async function runAi(action: "generate" | "revise" | "answer", body: unknown) {
    if (!beginOperation()) return;
    setQuestions([]);
    try {
      const response = await fetch(`/api/ai/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? "AI 请求失败，请重试。");
        return;
      }
      if (data.result.kind === "clarification") {
        setQuestions(data.result.questions);
        setCandidate(undefined);
        setAnswer(undefined);
        return;
      }
      if (action === "answer") {
        setAnswer(data.result.data);
        setCandidate(undefined);
      } else {
        setCandidate(data.result.data);
        setAnswer(undefined);
      }
    } catch {
      setMessage("AI 请求结果未知，可按需重试。");
    } finally {
      finishOperation();
    }
  }

  function adoptCandidate() {
    if (!candidate || isSubmittingRef.current) return;
    setDraft((current) => ({ ...current, ...candidate, slug: current.slug, coverImage: current.coverImage }));
    setCandidate(undefined);
    setMessage("候选内容已复制到编辑器，尚未保存。");
  }

  async function remove() {
    if (!saved || isSubmittingRef.current || unknownWriteRef.current || !window.confirm("确定删除这篇攻略？此操作无法撤销。") || !beginOperation(true)) return;
    try {
      const response = await fetch(`/api/guides/${saved.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: saved.revision }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) {
        router.push("/admin/guides");
        return;
      }
      const data = await response.json().catch(() => null);
      setMessage(data?.error?.message ?? "删除失败。");
    } catch {
      await markUnknown("删除", saved.id);
    } finally {
      finishOperation();
    }
  }

  return (
    <>
      <header className="admin-header">
        <div>
          <Link href="/admin/guides">← 攻略列表</Link>
          <h1>{saved ? "编辑攻略" : "新建攻略"}</h1>
          {saved && <p><span className={`status ${saved.status}`}>{saved.status === "published" ? "已发布" : "草稿"}</span> · 版本 {saved.revision}</p>}
        </div>
        <div className="actions">
          <button type="button" disabled={busy || unknownWrite} onClick={save}>{busy ? "处理中…" : "保存攻略"}</button>
          {saved?.status === "published" ? (
            <button className="secondary" type="button" disabled={busy || unknownWrite} onClick={() => transition("unpublish")}>撤回</button>
          ) : (
            <button className="secondary" type="button" disabled={busy || unknownWrite} onClick={() => transition("publish")}>发布攻略</button>
          )}
          {saved && <button className="danger" type="button" disabled={busy || unknownWrite} onClick={remove}>删除攻略</button>}
        </div>
      </header>

      {message && <p className={message.includes("冲突") || message.includes("失败") || message.includes("未知") || message.includes("需填写") ? "error" : "success"} role="status">{message}</p>}

      <div className="editor-layout">
        <form className="panel editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset className="editor-fields" disabled={freezeEditor}>
          <section>
            <h2>基本信息</h2>
            <div className="form-grid">
              <label className="wide">标题<input value={draft.title} onChange={(event) => field("title", event.target.value)} /></label>
              <label>链接名称（Slug）<input value={draft.slug ?? ""} onChange={(event) => field("slug", event.target.value)} placeholder="hangzhou-weekend" /></label>
              <label>目的地<input value={draft.destination} onChange={(event) => field("destination", event.target.value)} /></label>
              <label>天数<input type="number" min="1" max="365" value={draft.days} onChange={(event) => setDays(Number(event.target.value))} /></label>
              <label className="wide">简介<textarea value={draft.excerpt} onChange={(event) => field("excerpt", event.target.value)} /></label>
            </div>
          </section>

          <details className="ai-assistant">
            <summary>AI 旅行助手<span>生成草稿、调整行程与问答</span></summary>
            <p className="hint">AI 只生成候选内容，不会自动保存或发布。</p>
            <div className="form-grid">
              <label>出行日期或季节<input value={travelTime} onChange={(event) => setTravelTime(event.target.value)} /></label>
              <label>预算<input value={budget} onChange={(event) => setBudget(event.target.value)} /></label>
              <label>同行人群<input value={travelers} onChange={(event) => setTravelers(event.target.value)} /></label>
              <label>偏好（逗号分隔）<input value={preferences} onChange={(event) => setPreferences(event.target.value)} /></label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAi("generate", {
                    destination: draft.destination || undefined,
                    days: draft.days,
                    travelDateOrSeason: travelTime || undefined,
                    budget: budget || undefined,
                    travelers: travelers || undefined,
                    preferences: preferences.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
                  })
                }
              >
                生成候选攻略
              </button>
              <label className="wide">调整要求<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
              <button
                type="button"
                disabled={busy || !instruction.trim()}
                onClick={() => runAi("revise", { existingGuide: aiContentOf(draft), instruction })}
              >
                生成调整候选
              </button>
              <label className="wide">攻略问答<input value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
              <button
                type="button"
                disabled={busy || !question.trim()}
                onClick={() => runAi("answer", { existingGuide: aiContentOf(draft), question })}
              >
                询问 AI
              </button>
            </div>
            {questions.length > 0 && (
              <div role="status">
                <strong>还需要：</strong>
                <ul>{questions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            )}
            {candidate && (
              <div className="panel">
                <h3>AI 候选：{candidate.title}</h3>
                <p>{candidate.destination} · {candidate.days} 天</p>
                <p>{candidate.excerpt}</p>
                <p>{candidate.sources.length ? `含 ${candidate.sources.length} 个联网来源` : "未取得联网来源，请人工复核"}</p>
                <AiSources sources={candidate.sources} />
                <button type="button" disabled={busy} onClick={adoptCandidate}>采纳到编辑器（不保存）</button>
              </div>
            )}
            {answer && (
              <div className="panel">
                <h3>AI 回答</h3>
                <p className="preline">{answer.answer}</p>
                <AiSources sources={answer.sources} />
              </div>
            )}
          </details>

          <section>
            <h2>封面图片</h2>
            <div className="form-grid">
              <label className="wide">
                上传 JPEG、PNG 或 WebP（最大 10 MiB）
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) => {
                    void uploadCover(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {draft.coverImage && (
                <>
                  <p className="wide hint">封面已上传，请填写图片描述后保存。</p>
                  <label className="wide">
                    图片描述（用于无障碍阅读，发布必填）
                    <input
                      value={draft.coverImage.alt}
                      onChange={(event) =>
                        field("coverImage", { ...draft.coverImage!, alt: event.target.value })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </section>

          <section>
            <h2>逐日行程</h2>
            {draft.itinerary.map((day, dayIndex) => (
              <fieldset key={day.day}>
                <legend>第 {day.day} 天</legend>
                <label>
                  当日标题
                  <input value={day.title} onChange={(event) => setDay(dayIndex, "title", event.target.value)} />
                </label>
                {day.items.map((item, itemIndex) => (
                  <div className="item-grid" key={itemIndex}>
                    <label>
                      时间
                      <input value={item.time ?? ""} onChange={(event) => setItem(dayIndex, itemIndex, "time", event.target.value)} />
                    </label>
                    <label>
                      地点
                      <input value={item.place} onChange={(event) => setItem(dayIndex, itemIndex, "place", event.target.value)} />
                    </label>
                    <label className="wide">
                      说明
                      <textarea value={item.description} onChange={(event) => setItem(dayIndex, itemIndex, "description", event.target.value)} />
                    </label>
                    <label className="wide">
                      提示
                      <input value={item.tips ?? ""} onChange={(event) => setItem(dayIndex, itemIndex, "tips", event.target.value)} />
                    </label>
                    {day.items.length > 1 && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          field(
                            "itinerary",
                            draft.itinerary.map((entry, index) =>
                              index === dayIndex
                                ? { ...entry, items: entry.items.filter((_, inner) => inner !== itemIndex) }
                                : entry
                            )
                          )
                        }
                      >
                        移除此项
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    field(
                      "itinerary",
                      draft.itinerary.map((entry, index) =>
                        index === dayIndex ? { ...entry, items: [...entry.items, { place: "", description: "" }] } : entry
                      )
                    )
                  }
                >
                  添加地点
                </button>
              </fieldset>
            ))}
          </section>

          <section>
            <h2>实用章节</h2>
            {draft.sections.map((section, index) => (
              <fieldset key={index}>
                <div className="form-grid">
                  <label>
                    类型
                    <select
                      value={section.kind}
                      onChange={(event) =>
                        field(
                          "sections",
                          draft.sections.map((entry, inner) =>
                            inner === index ? { ...entry, kind: event.target.value as typeof entry.kind } : entry
                          )
                        )
                      }
                    >
                      <option value="transport">交通</option>
                      <option value="stay">住宿</option>
                      <option value="food">餐饮</option>
                      <option value="budget">预算</option>
                      <option value="safety">安全</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                  <label>
                    标题
                    <input
                      value={section.title}
                      onChange={(event) =>
                        field(
                          "sections",
                          draft.sections.map((entry, inner) =>
                            inner === index ? { ...entry, title: event.target.value } : entry
                          )
                        )
                      }
                    />
                  </label>
                  <label className="wide">
                    正文
                    <textarea
                      value={section.body}
                      onChange={(event) =>
                        field(
                          "sections",
                          draft.sections.map((entry, inner) =>
                            inner === index ? { ...entry, body: event.target.value } : entry
                          )
                        )
                      }
                    />
                  </label>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => field("sections", draft.sections.filter((_, inner) => inner !== index))}
                >
                  移除章节
                </button>
              </fieldset>
            ))}
            <button
              className="secondary"
              type="button"
              onClick={() => field("sections", [...draft.sections, { kind: "other", title: "", body: "" }])}
            >
              添加章节
            </button>
          </section>

          <section>
            <h2>来源</h2>
            {draft.sources.map((source, index) => (
              <fieldset key={index}>
                <div className="form-grid">
                  <label>
                    标题
                    <input
                      value={source.title}
                      onChange={(event) =>
                        field(
                          "sources",
                          draft.sources.map((entry, inner) =>
                            inner === index ? { ...entry, title: event.target.value } : entry
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    URL
                    <input
                      type="url"
                      value={source.url}
                      onChange={(event) =>
                        field(
                          "sources",
                          draft.sources.map((entry, inner) =>
                            inner === index ? { ...entry, url: event.target.value } : entry
                          )
                        )
                      }
                    />
                  </label>
                  <label>
                    访问时间
                    <input
                      type="datetime-local"
                      value={source.accessedAt.slice(0, 16)}
                      onChange={(event) =>
                        field(
                          "sources",
                          draft.sources.map((entry, inner) =>
                            inner === index
                              ? { ...entry, accessedAt: event.target.value ? new Date(event.target.value).toISOString() : "" }
                              : entry
                          )
                        )
                      }
                    />
                  </label>
                  <label className="wide">
                    引用内容
                    <textarea
                      value={source.citedText ?? ""}
                      onChange={(event) =>
                        field(
                          "sources",
                          draft.sources.map((entry, inner) =>
                            inner === index ? { ...entry, citedText: event.target.value } : entry
                          )
                        )
                      }
                    />
                  </label>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => field("sources", draft.sources.filter((_, inner) => inner !== index))}
                >
                  移除来源
                </button>
              </fieldset>
            ))}
            <button
              className="secondary"
              type="button"
              onClick={() =>
                field("sources", [
                  ...draft.sources,
                  { title: "", url: "", accessedAt: new Date().toISOString() },
                ])
              }
            >
              添加来源
            </button>
          </section>

          <button type="submit" disabled={busy || unknownWrite}>保存攻略</button>
          </fieldset>
        </form>

        <aside className="panel preview" aria-labelledby="preview-title">
          <p className="eyebrow">实时预览</p>
          <h2 id="preview-title">{draft.title || "未命名攻略"}</h2>
          <p>{draft.destination || "目的地"} · {draft.days} 天</p>
          {draft.coverImage?.publicUrl && (
            <img src={draft.coverImage.publicUrl} alt={draft.coverImage.alt || "封面预览（尚未填写替代文本）"} />
          )}
          <p>{draft.excerpt || "攻略简介会显示在这里。"}</p>
          {draft.itinerary.map((day) => (
            <div key={day.day}>
              <h3>第 {day.day} 天 · {day.title || "未填写"}</h3>
              <ul>
                {day.items.map((item, index) => (
                  <li key={index}>
                    {item.time && `${item.time} · `}
                    {item.place || "未填写地点"}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
