import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructor: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: mocks.create };
    constructor(options: unknown) { mocks.constructor(options); }
  },
}));
vi.mock("@/auth", () => ({ requireAdmin: mocks.requireAdmin }));

import { answerGuideQuestion, generateGuideDraft, reviseGuide } from "@/lib/ai/gemini";
import { POST as generateRoute } from "@/app/api/ai/generate/route";
import { POST as reviseRoute } from "@/app/api/ai/revise/route";

const guide = {
  title: "北京三日游",
  destination: "北京",
  excerpt: "故宫与胡同路线",
  days: 3,
  itinerary: [1, 2, 3].map((day) => ({ day, title: `第 ${day} 天`, items: [{ place: `地点 ${day}`, description: "步行游览" }] })),
  sections: [{ kind: "transport" as const, title: "交通", body: "乘坐地铁" }],
  sources: [],
};

function completed(value: unknown, annotations: unknown[] = []) {
  const text = JSON.stringify(value);
  return { status: "completed", output_text: text, steps: [{ type: "model_output", content: [{ type: "text", text, annotations }] }] };
}

function candidate(data: unknown = guide) {
  return { kind: "candidate", data };
}

function generateInput(overrides: Record<string, unknown> = {}) {
  return {
    destination: "北京",
    days: 3,
    travelDateOrSeason: "2026 年 10 月",
    budget: "中等",
    travelers: "两位成人",
    preferences: ["历史", "美食"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-test-model");
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" } });
});

describe("grounded Gemini assistant", () => {
  it("uses one bounded Interactions request for generate, revise, and answer", async () => {
    mocks.create
      .mockResolvedValueOnce(completed(candidate({ ...guide, sources: [] })))
      .mockResolvedValueOnce(completed(candidate({ ...guide, title: "调整后的北京路线", sources: [] })))
      .mockResolvedValueOnce(completed(candidate({ answer: "建议提前预约。", sources: [] })));

    await expect(generateGuideDraft(generateInput())).resolves.toMatchObject({ kind: "candidate", data: { title: guide.title } });
    const original = structuredClone(guide);
    await expect(reviseGuide(guide, "第二天减少步行")).resolves.toMatchObject({ kind: "candidate", data: { title: "调整后的北京路线" } });
    expect(guide).toEqual(original);
    await expect(answerGuideQuestion(guide, "故宫需要预约吗？")).resolves.toEqual({ kind: "candidate", data: { answer: "建议提前预约。", sources: [] } });

    expect(mocks.create).toHaveBeenCalledTimes(3);
    for (const [params, options] of mocks.create.mock.calls) {
      expect(params).toMatchObject({ model: "gemini-test-model", store: false, tools: [{ type: "google_search" }], response_format: { type: "text", mime_type: "application/json" } });
      expect(params.response_format.schema).toHaveProperty("anyOf");
      expect(params.response_format.schema).not.toHaveProperty("oneOf");
      const serializedSchema = JSON.stringify(params.response_format.schema);
      expect(serializedSchema).not.toMatch(/\"(?:\$schema|minLength|maxLength|minimum|maximum|minItems|maxItems|const)\"/);
      expect(serializedSchema).not.toContain('\"items\":{}');
      expect(serializedSchema).toContain('\"enum\":[\"candidate\"]');
      expect(serializedSchema).toContain('\"enum\":[\"clarification\"]');
      expect(options).toEqual({ timeout: 20_000, maxRetries: 0 });
    }
    const answerPrompt = JSON.stringify(mocks.create.mock.calls[2][0].input);
    expect(answerPrompt).toContain("故宫需要预约吗？");
    expect(answerPrompt).not.toContain("objectKey");
    expect(answerPrompt).not.toContain("revision");
  });

  it("clarifies missing critical generation constraints without calling Gemini", async () => {
    await expect(generateGuideDraft(generateInput({ budget: undefined, preferences: [] }))).resolves.toMatchObject({
      kind: "clarification",
      questions: expect.arrayContaining([expect.stringContaining("预算"), expect.stringContaining("偏好")]),
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects malformed and semantically invalid completed output", async () => {
    mocks.create.mockResolvedValueOnce({ status: "completed", output_text: "not json", steps: [] });
    await expect(generateGuideDraft(generateInput())).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", retryable: true });

    mocks.create.mockResolvedValueOnce(completed(candidate({ ...guide, days: 2, itinerary: [{ day: 3, title: "越界", items: [] }], sources: [] })));
    await expect(generateGuideDraft(generateInput())).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE", retryable: true });
  });

  it("overwrites model sources from valid URL citations using UTF-8 byte offsets", async () => {
    const data = { ...guide, sources: [{ title: "模型编造", url: "https://fake.invalid", accessedAt: "2020-01-01T00:00:00.000Z" }] };
    const value = candidate(data);
    const text = JSON.stringify(value);
    const cited = "北京";
    const start = Buffer.byteLength(text.slice(0, text.indexOf(cited)), "utf8");
    const end = start + Buffer.byteLength(cited, "utf8");
    const secondCited = "三日";
    const secondStart = Buffer.byteLength(text.slice(0, text.indexOf(secondCited)), "utf8");
    const secondEnd = secondStart + Buffer.byteLength(secondCited, "utf8");
    mocks.create.mockResolvedValueOnce(completed(value, [
      { type: "url_citation", title: "北京市文化和旅游局", url: "https://example.gov.cn/beijing", start_index: start, end_index: end },
      { type: "url_citation", url: "https://example.gov.cn/beijing", start_index: secondStart, end_index: secondEnd },
      { type: "url_citation", title: "坏链接", url: "javascript:alert(1)", start_index: start, end_index: end },
    ]));

    const result = await generateGuideDraft(generateInput());
    expect(result).toMatchObject({ kind: "candidate" });
    if (result.kind === "candidate") {
      expect(result.data.sources[0]).toMatchObject({ title: "北京市文化和旅游局", url: "https://example.gov.cn/beijing", citedText: "北京" });
      expect(result.data.sources).toHaveLength(2);
      expect(result.data.sources[0].accessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.data.sources[1]).toMatchObject({ title: "example.gov.cn", citedText: "三日" });
    }
  });

  it.each([
    [{ name: "AbortError" }, "AI_TIMEOUT", true],
    [{ status: 429 }, "AI_RATE_LIMITED", true],
    [{ status: 401 }, "AI_AUTH_ERROR", false],
    [{ status: 500, message: "secret provider details" }, "AI_PROVIDER_ERROR", true],
  ])("maps provider failures to stable redacted errors", async (providerError, code, retryable) => {
    mocks.create.mockRejectedValue(providerError);
    await expect(generateGuideDraft(generateInput())).rejects.toMatchObject({ code, retryable });
  });
});

describe("AI routes", () => {
  function request(body: unknown) {
    return new Request("http://localhost:3000/api/ai/generate", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("authorizes before parsing or calling the provider", async () => {
    mocks.requireAdmin.mockRejectedValue(new HttpError(401, "UNAUTHORIZED", "需要管理员登录"));
    const malformed = new Request("http://localhost:3000/api/ai/generate", { method: "POST", body: "{" });
    const response = await generateRoute(malformed);
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates strict bounded route input before calling the provider", async () => {
    const response = await generateRoute(request({ ...generateInput(), unexpected: true }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns stable retryable errors without provider details", async () => {
    mocks.create.mockRejectedValue({ status: 500, message: "secret provider details" });
    const response = await generateRoute(request(generateInput()));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "AI_PROVIDER_ERROR", message: "AI 服务暂时不可用，请稍后重试", retryable: true } });
    expect(JSON.stringify(body)).not.toContain("secret provider details");
  });

  it("uses the same auth and validation boundary for revise", async () => {
    const response = await reviseRoute(new Request("http://localhost:3000/api/ai/revise", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ existingGuide: guide, instruction: "" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
