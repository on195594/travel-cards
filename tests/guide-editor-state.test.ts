import { afterEach, describe, expect, it, vi } from "vitest";
import type { Guide, GuideDraftInput } from "@/lib/guides/schema";
import {
  claimGuideWrite,
  markGuideWriteUnknown,
  mergeSavedSnapshot,
  requestJson,
  saveThenPublish,
} from "@/components/guide-editor";

afterEach(() => vi.unstubAllGlobals());

function draft(title: string): GuideDraftInput {
  return {
    title,
    slug: "hangzhou",
    destination: "杭州",
    excerpt: "简介",
    days: 1,
    itinerary: [{ day: 1, title: "第一天", items: [{ place: "西湖", description: "游览" }] }],
    sections: [],
    sources: [],
  };
}

function savedGuide(content: GuideDraftInput): Guide {
  return {
    ...content,
    id: "507f1f77bcf86cd799439011",
    status: "draft",
    revision: 2,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:01:00.000Z",
  };
}

describe("guide editor save timing", () => {
  it("keeps input changed while a save response is in flight", async () => {
    const sent = draft("发送时标题");
    let current = sent;
    let resolveResponse!: (guide: Guide) => void;
    const response = new Promise<Guide>((resolve) => { resolveResponse = resolve; });
    const merged = response.then((guide) => mergeSavedSnapshot(current, sent, guide));

    current = { ...current, title: "请求期间的新标题" };
    resolveResponse(savedGuide({ ...sent, title: "发送时标题" }));

    await expect(merged).resolves.toMatchObject({ title: "请求期间的新标题", slug: "hangzhou" });
  });

  it("accepts the server value for fields unchanged after send", () => {
    const sent = draft("  服务端会规范化  ");
    const server = savedGuide({ ...sent, title: "服务端会规范化" });
    expect(mergeSavedSnapshot(sent, sent, server).title).toBe("服务端会规范化");
  });

  it("rejects duplicate and post-unknown writes synchronously", () => {
    const inFlight = { current: false };
    const unknown = { current: false };

    expect(claimGuideWrite(inFlight, unknown, true)).toBe(true);
    expect(claimGuideWrite(inFlight, unknown, true)).toBe(false);

    inFlight.current = false;
    markGuideWriteUnknown(unknown);
    expect(claimGuideWrite(inFlight, unknown, true)).toBe(false);
  });

  it("publishes only the revision returned by the completed save", async () => {
    const calls: string[] = [];
    let finishSave!: (guide: Guide) => void;
    const pendingSave = new Promise<Guide>((resolve) => { finishSave = resolve; });
    const operation = saveThenPublish(
      async () => {
        calls.push("save");
        return pendingSave;
      },
      async (guide) => {
        calls.push(`publish:${guide.revision}`);
        return guide;
      }
    );

    await Promise.resolve();
    expect(calls).toEqual(["save"]);
    finishSave(savedGuide(draft("已保存")));
    await operation;
    expect(calls).toEqual(["save", "publish:2"]);
  });
});

describe("guide editor requests", () => {
  it("distinguishes server errors, valid responses, and unknown outcomes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { message: "具体错误" } }),
        { status: 400, headers: { "content-type": "application/json" } }
      ))
      .mockResolvedValueOnce(Response.json({ value: "ok" }))
      .mockRejectedValueOnce(new Error("network failed"));
    vi.stubGlobal("fetch", fetchMock);
    const isValue = (value: unknown): value is { value: string } =>
      Boolean(value) && typeof value === "object" && typeof (value as { value?: unknown }).value === "string";

    await expect(requestJson("/error", {}, isValue)).resolves.toEqual({
      kind: "error",
      status: 400,
      message: "具体错误",
    });
    await expect(requestJson("/ok", {}, isValue)).resolves.toEqual({
      kind: "ok",
      data: { value: "ok" },
    });
    await expect(requestJson("/unknown", {}, isValue)).resolves.toEqual({ kind: "unknown" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/error", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([502, 504])("treats a %i mutation response as indeterminate", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    const isValue = (value: unknown): value is { value: string } => Boolean(value);

    await expect(requestJson("/write", { method: "POST" }, isValue, 15_000, true))
      .resolves.toEqual({ kind: "unknown" });
  });
});
