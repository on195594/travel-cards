import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGuide: vi.fn(),
  listAdminGuides: vi.fn(),
  listPublishedGuides: vi.fn(),
  updateGuide: vi.fn(),
  publishGuide: vi.fn(),
  auth: vi.fn(),
}));

vi.mock("@/lib/guides", () => ({
  createGuide: mocks.createGuide,
  listAdminGuides: mocks.listAdminGuides,
  listPublishedGuides: mocks.listPublishedGuides,
  updateGuide: mocks.updateGuide,
  publishGuide: mocks.publishGuide,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  requireAdmin: async (request?: Request) => {
    const { assertAdminOrToken } = await import("@/lib/admin");
    const authHeader = request?.headers.get("authorization");
    return assertAdminOrToken(mocks.auth(), authHeader);
  },
}));

import { GET as listGuidesRoute, POST as createGuideRoute } from "@/app/api/guides/route";
import { PATCH as updateGuideRoute } from "@/app/api/guides/[id]/route";
import { POST as publishGuideRoute } from "@/app/api/guides/[id]/publish/route";

describe("Guide Route Handlers with API Token", () => {
  const TEST_TOKEN = "valid-secret-token-for-hermes-12345";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HERMES_API_TOKEN", TEST_TOKEN);
    vi.stubEnv("ADMIN_EMAIL", "admin@example.test");
    mocks.auth.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects POST /api/guides without auth", async () => {
    const request = new Request("http://localhost:3100/api/guides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "测试攻略" }),
    });
    const response = await createGuideRoute(request);
    expect(response.status).toBe(401);
    expect(mocks.createGuide).not.toHaveBeenCalled();
  });

  it("rejects POST /api/guides with invalid Bearer token", async () => {
    const request = new Request("http://localhost:3100/api/guides", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token-12345",
        "content-type": "application/json",
      },
      body: JSON.stringify({ title: "测试攻略" }),
    });
    const response = await createGuideRoute(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.message).toContain("无效的 API Token");
    expect(mocks.createGuide).not.toHaveBeenCalled();
  });

  it("accepts POST /api/guides with valid Bearer token and creates/publishes", async () => {
    const payload = {
      title: "成都周末游",
      slug: "chengdu-weekend",
      destination: "成都",
      excerpt: "体验成都慢生活与川味美食。",
      days: 2,
      publish: true,
    };
    mocks.createGuide.mockResolvedValue({ id: "g1", ...payload, status: "published", revision: 1 });

    const request = new Request("http://localhost:3100/api/guides", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await createGuideRoute(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.guide).toMatchObject({ id: "g1", status: "published" });
    expect(mocks.createGuide).toHaveBeenCalledWith(payload);
  });

  it("accepts PATCH /api/guides/[id] with valid Bearer token", async () => {
    const patchBody = { expectedRevision: 1, excerpt: "更新后的简介" };
    mocks.updateGuide.mockResolvedValue({ id: "g1", title: "成都周末游", excerpt: "更新后的简介", revision: 2 });

    const request = new Request("http://localhost:3100/api/guides/g1", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(patchBody),
    });

    const response = await updateGuideRoute(request, { params: Promise.resolve({ id: "g1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.guide.revision).toBe(2);
    expect(mocks.updateGuide).toHaveBeenCalledWith("g1", patchBody);
  });

  it("accepts POST /api/guides/[id]/publish with valid Bearer token", async () => {
    const publishBody = { expectedRevision: 1 };
    mocks.publishGuide.mockResolvedValue({ id: "g1", status: "published", revision: 2 });

    const request = new Request("http://localhost:3100/api/guides/g1/publish", {
      method: "POST",
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(publishBody),
    });

    const response = await publishGuideRoute(request, { params: Promise.resolve({ id: "g1" }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.guide.status).toBe("published");
    expect(mocks.publishGuide).toHaveBeenCalledWith("g1", publishBody);
  });

  it("allows GET /api/guides?scope=admin with valid Bearer token", async () => {
    mocks.listAdminGuides.mockResolvedValue([{ id: "g1", title: "草稿或已发布攻略" }]);

    const request = new Request("http://localhost:3100/api/guides?scope=admin", {
      method: "GET",
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });

    const response = await listGuidesRoute(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.guides).toHaveLength(1);
    expect(data.guides[0]).toMatchObject({ itinerary: [], sections: [], sources: [] });
    expect(mocks.listAdminGuides).toHaveBeenCalled();
  });
});
