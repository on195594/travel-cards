import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "@/lib/capabilities";

const mocks = vi.hoisted(() => ({
  principal: null as ApiActor | null,
  auth: vi.fn(),
  upload: vi.fn(),
  generate: vi.fn(),
  revise: vi.fn(),
  answer: vi.fn(),
}));

// Fake only the identity transport; exercise the real capability guard and Guide persistence.
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return {
    ...actual,
    assertAdminOrToken: (...args: Parameters<typeof actual.assertAdminOrToken>) =>
      mocks.principal ?? actual.assertAdminOrToken(...args),
  };
});
vi.mock("next-auth", () => ({ default: () => ({ auth: mocks.auth }) }));
vi.mock("@/lib/storage/r2", () => ({ MAX_MULTIPART_BYTES: 6 * 1024 * 1024, uploadImage: mocks.upload }));
vi.mock("@/lib/ai/gemini", () => ({
  generateGuideDraft: mocks.generate, reviseGuide: mocks.revise, answerGuideQuestion: mocks.answer,
}));

import { GET as list, POST as create } from "@/app/api/guides/route";
import { GET as read, PATCH as update, DELETE as remove } from "@/app/api/guides/[id]/route";
import { POST as publish } from "@/app/api/guides/[id]/publish/route";
import { POST as unpublish } from "@/app/api/guides/[id]/unpublish/route";
import { POST as upload } from "@/app/api/uploads/route";
import { POST as generate } from "@/app/api/ai/generate/route";
import { POST as revise } from "@/app/api/ai/revise/route";
import { POST as answer } from "@/app/api/ai/answer/route";
import { getGuideById } from "@/lib/guides";

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");
const token = "trusted-automation-test-token-12345";
const draft = {
  title: "杭州一日游", slug: "capability-hangzhou", destination: "杭州", excerpt: "西湖散步", days: 1,
  coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" },
  itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行游览" }] }],
};
const context = (id: string) => ({ params: Promise.resolve({ id }) });
function request(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { origin: "http://localhost:3000", "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function createDraft(publish = false) {
  const response = await create(request("POST", "/api/guides", { ...draft, publish }));
  expect(response.status).toBe(201);
  return (await response.json()).guide;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HERMES_API_TOKEN", token);
  vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
  mocks.auth.mockResolvedValue(null);
  mocks.principal = { authKind: "restricted-ai", actorLabel: "fake-mcp-client" };
});
afterEach(async () => {
  vi.unstubAllEnvs();
  mocks.principal = null;
  if (!mongoose.connection.db) return;
  if (mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database cleanup");
  await mongoose.connection.collection("guides").deleteMany({ slug: /^capability-/ });
});
afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("restricted AI capability boundary (fake authentication, isolated MongoDB)", () => {
  it("allows create, private read, update and publish without bypassing revision conflicts", async () => {
    const guide = await createDraft();
    expect((await list(request("GET", "/api/guides?scope=admin"))).status).toBe(200);
    expect((await read(request("GET", `/api/guides/${guide.id}`), context(guide.id))).status).toBe(200);
    const patch = { expectedRevision: 1, excerpt: "更新后的西湖散步" };
    expect((await update(request("PATCH", `/api/guides/${guide.id}`, patch), context(guide.id))).status).toBe(200);
    const conflict = await update(request("PATCH", `/api/guides/${guide.id}`, patch), context(guide.id));
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("REVISION_CONFLICT");
    const response = await publish(request("POST", `/api/guides/${guide.id}/publish`, { expectedRevision: 2 }), context(guide.id));
    expect(response.status).toBe(200);
    expect(await getGuideById(guide.id)).toMatchObject({ status: "published", revision: 3, excerpt: patch.excerpt });
  });

  it.each([{ publish: true }, { status: "published" }])("allows direct publication %j only for complete valid content", async (publication) => {
    const invalid = await create(request("POST", "/api/guides", { title: "未完成", ...publication }));
    expect(invalid.status).toBe(400);
    const response = await create(request("POST", "/api/guides", { ...draft, ...publication }));
    expect(response.status).toBe(201);
    expect((await response.json()).guide).toMatchObject({ status: "published", revision: 1 });
  });

  it.each([
    ["DELETE", "/api/guides/id", remove],
    ["POST", "/api/guides/id/unpublish", unpublish],
    ["POST", "/api/uploads", upload],
    ["POST", "/api/ai/generate", generate],
    ["POST", "/api/ai/revise", revise],
    ["POST", "/api/ai/answer", answer],
  ] as const)("denies %s %s before reading the body, with no mutation or provider call", async (method, path, handler) => {
    const guide = await createDraft(true);
    const before = await getGuideById(guide.id);
    const req = request(method, path.replace("/id", `/${guide.id}`), { expectedRevision: 1, authKind: "session" });
    const response = await handler(req, context(guide.id));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(req.bodyUsed).toBe(false);
    expect(await getGuideById(guide.id)).toEqual(before);
    for (const provider of [mocks.upload, mocks.generate, mocks.revise, mocks.answer]) expect(provider).not.toHaveBeenCalled();
  });

  it.each(["session", "token"])("preserves actual %s administrator deletion", async (kind) => {
    const guide = await createDraft();
    mocks.principal = null;
    if (kind === "session") mocks.auth.mockResolvedValue({ user: { id: "admin", email: "admin@example.test" } });
    const headers = kind === "token" ? { authorization: `Bearer ${token}`, origin: "https://automation.example.test" } : undefined;
    const response = await remove(request("DELETE", `/api/guides/${guide.id}`, { expectedRevision: 1 }, headers), context(guide.id));
    expect(response.status).toBe(204);
    await expect(getGuideById(guide.id)).rejects.toMatchObject({ status: 404 });
  });

  it("does not accept a request-supplied AI identity as authentication", async () => {
    mocks.principal = null;
    const req = request("POST", "/api/guides", { ...draft, authKind: "restricted-ai" }, { "x-auth-kind": "restricted-ai" });
    expect((await create(req)).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
  });
});
