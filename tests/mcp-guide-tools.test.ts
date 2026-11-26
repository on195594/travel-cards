import { McpServer } from "@modelcontextprotocol/server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/mcp/route";
import type { ApiActor } from "@/lib/capabilities";
import { getGuideById, updateGuide, type Guide } from "@/lib/guides";
import { issueMcpOAuthAccessGrant } from "@/lib/mcp/access-grants";
import { MCP_SERVER_INFO, registerGuideTools } from "@/lib/mcp/guide-tools";
import { authorizeMcpClient, registerMcpClient } from "@/lib/mcp/oauth-clients";
import * as attachmentFetch from "@/lib/storage/fetch-attachment";
import * as imageFetch from "@/lib/storage/fetch-image";

const fakeAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: fakeAuth }));

const runId = process.env.TRAVEL_CARDS_TEST_RUN_ID;
if (!runId || !/^[a-z0-9_]+$/.test(runId)) throw new Error("Run database tests through npm test");

const uploadImageMock = vi.fn();
const uploadAttachmentMock = vi.fn();
vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    uploadImage: (...args: Parameters<typeof actual.uploadImage>) => uploadImageMock(...args),
  };
});
vi.mock("@/lib/storage/attachments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/attachments")>();
  return {
    ...actual,
    uploadAttachment: (...args: Parameters<typeof actual.uploadAttachment>) => uploadAttachmentMock(...args),
  };
});

const origin = "https://travel.example.test";
const version = "2026-07-28";
const meta = { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} };
const admin = { authKind: "session" as const, actorLabel: "admin@example.test", user: { id: "admin", email: "admin@example.test" } };
const actor: ApiActor = {
  authKind: "restricted-ai",
  actorLabel: "fake-oauth-client",
  scopes: ["guide.read", "guide.create", "guide.update", "guide.publish", "image.upload", "attachment.upload"],
};
const validPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const draft = {
  title: "西湖一日游",
  slug: "mcp-tool-hangzhou",
  destination: "杭州",
  excerpt: "西湖漫步",
  days: 1,
  coverImage: { objectKey: "guides/test.jpg", publicUrl: "https://images.example.test/test.jpg", alt: "西湖" },
  itinerary: [{ day: 1, title: "西湖", items: [{ place: "西湖", description: "步行游览" }] }],
  sources: [{ title: "旅游参考", url: "https://example.test/travel", accessedAt: "2026-10-09T00:00:00.000Z" }],
};

const grantedTokens = new Map<string, string>();

async function tokenForActor(currentActor: ApiActor): Promise<string> {
  if (currentActor.authKind !== "restricted-ai") throw new Error("Expected restricted-ai actor");
  const key = currentActor.scopes.join(" ");
  const existing = grantedTokens.get(key);
  if (existing) return existing;
  const client = await registerMcpClient({
    redirect_uris: ["https://fake-client.example.test/callback"],
    token_endpoint_auth_method: "none",
    scope: key,
  });
  await authorizeMcpClient(admin, client.client_id, currentActor.scopes as Parameters<typeof authorizeMcpClient>[2]);
  const grant = await issueMcpOAuthAccessGrant(admin, {
    clientId: client.client_id,
    scopes: currentActor.scopes,
  });
  grantedTokens.set(key, grant.accessToken);
  return grant.accessToken;
}

async function mcpPost(currentActor: ApiActor, method: string, params: Record<string, unknown> = {}) {
  const token = await tokenForActor(currentActor);
  const response = await POST(new Request(origin + "/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": version,
      "Mcp-Method": method,
      ...(method === "tools/call" && typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: meta, ...params } }),
  }));
  return { status: response.status, headers: response.headers, body: await response.json() as Record<string, unknown> };
}

async function listTools(currentActor: ApiActor) {
  const res = await mcpPost(currentActor, "tools/list");
  expect(res.status).toBe(200);
  expect(res.body.result).toMatchObject({ resultType: "complete" });
  return (res.body.result as { tools: Array<Record<string, unknown>> }).tools;
}

async function callTool(currentActor: ApiActor, name: string, args?: unknown) {
  const res = await mcpPost(currentActor, "tools/call", args === undefined ? { name } : { name, arguments: args });
  return {
    status: res.status,
    headers: res.headers,
    ...(res.body as {
      result?: { resultType?: string; content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
      error?: { code: number; message: string };
    }),
  };
}

async function create(publish = false) {
  const output = await callTool(actor, "create_guide", { ...draft, publish });
  expect(output.status).toBe(200);
  expect(output.result?.isError).not.toBe(true);
  return output.result!.structuredContent!.guide as Guide;
}

beforeEach(() => {
  vi.stubEnv("AUTH_URL", origin);
  vi.stubEnv("MCP_OAUTH_ENABLED", "true");
  vi.stubEnv("HERMES_API_TOKEN", "legacy-token-at-least-16-characters");
  fakeAuth.mockResolvedValue({ user: admin.user });
});

afterEach(async () => {
  grantedTokens.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fakeAuth.mockReset();
  uploadImageMock.mockReset();
  uploadAttachmentMock.mockReset();
  if (!mongoose.connection.db) return;
  if (mongoose.connection.db.databaseName !== `travel_cards_test_${runId}`) throw new Error("Refusing non-test database cleanup");
  for (const collection of ["mcp_oauth_clients", "mcp_oauth_registration_windows", "mcp_access_grants"]) {
    await mongoose.connection.collection(collection).deleteMany({});
  }
  await mongoose.connection.collection<{ _id: string }>("mcp_tool_rate_limits").deleteMany({ _id: /^mcp-grant:/ });
  await mongoose.connection.collection("guides").deleteMany({ slug: /^mcp-tool-/ });
});

afterAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = undefined;
});

describe("MCP Guide tools registered on official McpServer (fake authenticated actor, real isolated persistence)", () => {
  it("advertises exactly seven tools with input JSON Schemas and honest write annotations", async () => {
    const tools = await listTools(actor);
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_guides", "get_guide", "create_guide", "update_guide", "publish_guide", "upload_image", "upload_attachment",
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      const annotations = tool.annotations as { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
      expect(annotations.readOnlyHint).toBe(["list_guides", "get_guide"].includes(tool.name as string));
      expect(annotations.destructiveHint).toBe(!annotations.readOnlyHint);
      expect(annotations.openWorldHint).toBe(["upload_image", "upload_attachment"].includes(tool.name as string));
    }
    expect(tools.find((tool) => tool.name === "update_guide")!.description).toContain("never retry");
    expect(tools.find((tool) => tool.name === "create_guide")!.description).toContain("not verified");
    expect(tools.find((tool) => tool.name === "upload_image")!.description).toContain("cover image");
    expect(tools.find((tool) => tool.name === "upload_image")!.description).toContain("2 MiB total JSON request");
    expect(tools.find((tool) => tool.name === "upload_attachment")!.description).toContain("GPX/KML route track or PDF");
  });

  it("creates, searches, reads, updates and publishes with the existing audit identity", async () => {
    const audit = vi.spyOn(console, "info").mockImplementation(() => {});
    const guide = await create();
    expect(guide.status).toBe("draft");

    const listed = await callTool(actor, "list_guides", { q: "西湖" });
    expect(listed.result!.structuredContent!.guides).toEqual(expect.arrayContaining([expect.objectContaining({ id: guide.id })]));

    const read = await callTool(actor, "get_guide", { id: guide.id });
    expect(read.result!.structuredContent!.guide).toMatchObject({ sources: draft.sources, revision: 1 });

    const changed = await callTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, excerpt: "更新后的行程" });
    expect(changed.result!.structuredContent!.guide).toMatchObject({ revision: 2 });

    const published = await callTool(actor, "publish_guide", { id: guide.id, expectedRevision: 2 });
    expect(published.result!.structuredContent!.guide).toMatchObject({ status: "published", revision: 3 });
    expect(audit).toHaveBeenLastCalledWith("admin_action", expect.objectContaining({
      authKind: "restricted-ai",
      actorLabel: expect.stringMatching(/^mcp-grant:[a-f\d]{24}$/),
      action: "guide.publish",
      beforeRevision: 2,
      afterRevision: 3,
    }));
  });

  it("supports omitted arguments for listing", async () => {
    expect((await callTool(actor, "list_guides")).result!.structuredContent!.guides).toBeInstanceOf(Array);
    expect((await callTool(actor, "list_guides", {})).result!.structuredContent!.guides).toBeInstanceOf(Array);
  });

  it("bounds list results, signals additional matches and filters before applying the limit", async () => {
    await create();
    await callTool(actor, "create_guide", { ...draft, slug: "mcp-tool-second", title: "另一个目的地" });

    const limited = await callTool(actor, "list_guides", { q: "西湖", limit: 1 });
    expect(limited.result!.structuredContent!.guides).toHaveLength(1);
    expect(limited.result!.structuredContent!.hasMore).toBe(true);

    const filtered = await callTool(actor, "list_guides", { q: "另一个目的地", limit: 1 });
    expect(filtered.result!.structuredContent!.guides).toEqual([expect.objectContaining({ title: "另一个目的地" })]);
    expect(filtered.result!.structuredContent!.hasMore).toBe(false);
    expect((await callTool(actor, "list_guides", { q: "不存在" })).result!.structuredContent).toEqual({ guides: [], hasMore: false });
  });

  it("preserves the default 100-result bound and detects truncation without a count query", async () => {
    await create();
    const now = new Date();
    await mongoose.connection.collection("guides").insertMany(
      Array.from({ length: 100 }, (_, index) => ({ ...draft, slug: `mcp-tool-list-${index}`, status: "draft", revision: 1, createdAt: now, updatedAt: now })),
    );
    const listed = await callTool(actor, "list_guides");
    expect(listed.result!.structuredContent!.guides).toHaveLength(100);
    expect(listed.result!.structuredContent!.hasMore).toBe(true);
  });

  it("supports concise write responses and retains revisions, full persistence and conflict protection", async () => {
    const created = await callTool(actor, "create_guide", { ...draft, responseMode: "summary" });
    const summary = created.result!.structuredContent!.guide as Guide;
    expect(summary).toMatchObject({ title: draft.title, revision: 1, status: "draft" });
    expect(summary).not.toHaveProperty("itinerary");
    expect(await getGuideById(summary.id)).toMatchObject({ itinerary: draft.itinerary, sources: draft.sources });

    const updated = await callTool(actor, "update_guide", { id: summary.id, expectedRevision: 1, title: "摘要模式更新", responseMode: "summary" });
    expect(updated.result!.structuredContent!.guide).toMatchObject({ revision: 2, title: "摘要模式更新" });
    expect(updated.result!.structuredContent!.guide).not.toHaveProperty("sources");

    const stale = await callTool(actor, "update_guide", { id: summary.id, expectedRevision: 1, title: "不应覆盖", responseMode: "summary" });
    expect(stale.result).toMatchObject({ isError: true, structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } } });

    const published = await callTool(actor, "publish_guide", { id: summary.id, expectedRevision: 2, responseMode: "summary" });
    expect(published.result!.structuredContent!.guide).toMatchObject({ revision: 3, status: "published" });
    expect(published.result!.structuredContent!.guide).not.toHaveProperty("itinerary");

    const full = await callTool(actor, "update_guide", { id: summary.id, expectedRevision: 3, responseMode: "full" });
    expect(full.result!.structuredContent!.guide).toMatchObject({ revision: 4, itinerary: draft.itinerary });
  });

  it("supports direct publishing but preserves completeness, slug uniqueness and revision checks", async () => {
    expect((await callTool(actor, "create_guide", { title: "未完成", publish: true })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PUBLISH_REQUIREMENTS" } },
    });

    const guide = await create(true);
    expect(guide.status).toBe("published");
    expect((await callTool(actor, "create_guide", { ...draft, publish: true })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 409, code: "SLUG_CONFLICT" } },
    });
    expect((await callTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, title: "" })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PUBLISH_REQUIREMENTS" } },
    });
    expect((await callTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, slug: "mcp-tool-changed" })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "PUBLISHED_SLUG_IMMUTABLE" } },
    });

    const patch = { id: guide.id, expectedRevision: 1, excerpt: "新简介" };
    await callTool(actor, "update_guide", patch);
    expect((await callTool(actor, "update_guide", patch)).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } },
    });
    expect((await callTool(actor, "publish_guide", { id: guide.id, expectedRevision: 1 })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } },
    });
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, excerpt: "新简介", status: "published" });
  });

  it("maps post-schema updateGuide ZodError after merging existing guide to 400 VALIDATION_ERROR with issues", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const twoDay = await callTool(actor, "create_guide", {
      ...draft,
      slug: "mcp-tool-two-day",
      days: 2,
      itinerary: [
        { day: 1, title: "第一天", items: [{ place: "断桥", description: "漫步" }] },
        { day: 2, title: "第二天", items: [{ place: "灵隐", description: "游览" }] },
      ],
    });
    expect(twoDay.status).toBe(200);
    const guide = twoDay.result!.structuredContent!.guide as Guide;

    const shrinkDays = await callTool(actor, "update_guide", { id: guide.id, expectedRevision: 1, days: 1 });
    expect(shrinkDays.status).toBe(200);
    expect(shrinkDays.result).toMatchObject({
      resultType: "complete",
      isError: true,
      structuredContent: {
        error: {
          status: 400,
          code: "VALIDATION_ERROR",
          message: expect.stringContaining("超出总天数"),
          issues: expect.arrayContaining([expect.objectContaining({ path: "itinerary", message: expect.stringContaining("超出总天数") })]),
        },
      },
    });

    const outOfRangeDay = await callTool(actor, "update_guide", {
      id: guide.id,
      expectedRevision: 1,
      itinerary: [
        { day: 1, title: "第一天", items: [{ place: "断桥", description: "漫步" }] },
        { day: 3, title: "第三天", items: [{ place: "九溪", description: "徒步" }] },
      ],
    });
    expect(outOfRangeDay.status).toBe(200);
    expect(outOfRangeDay.result).toMatchObject({
      resultType: "complete",
      isError: true,
      structuredContent: {
        error: {
          status: 400,
          code: "VALIDATION_ERROR",
          issues: expect.arrayContaining([expect.objectContaining({ path: "itinerary", message: expect.stringContaining("超出总天数") })]),
        },
      },
    });
    expect(errorLog).not.toHaveBeenCalled();
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 1, days: 2 });
  });

  it("rejects every unapproved tool without changing data", async () => {
    const guide = await create(true);
    for (const name of ["delete_guide", "unpublish_guide", "manage_config", "generate_guide", "__proto__"]) {
      const res = await callTool(actor, name, { id: guide.id, expectedRevision: 1 });
      expect(res.error?.code).toBe(-32602);
      expect(await getGuideById(guide.id)).toEqual(guide);
    }
  });

  it("uploads an image and optionally sets it on a guide", async () => {
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new-cover.png", publicUrl: "https://images.example.test/new-cover.png" });
    const standalone = await callTool(actor, "upload_image", { data: validPngBase64, alt: "西湖日出" });
    expect(standalone.result!.structuredContent!.coverImage).toEqual({
      objectKey: "guides/new-cover.png",
      publicUrl: "https://images.example.test/new-cover.png",
      alt: "西湖日出",
    });

    const guide = await create();
    const variants = [{ objectKey: "guides/new-cover-480w.webp", publicUrl: "https://images.example.test/new-cover-480w.webp", width: 480, height: 320 }];
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new-cover.png", publicUrl: "https://images.example.test/new-cover.png", variants });
    const updated = await callTool(actor, "upload_image", {
      data: `data:image/png;base64,${validPngBase64}`,
      alt: "西湖黄昏",
      guideId: guide.id,
      expectedRevision: 1,
      responseMode: "summary",
    });
    expect(updated.result!.structuredContent!.guide).toMatchObject({
      id: guide.id,
      revision: 2,
      coverImage: {
        objectKey: "guides/new-cover.png",
        publicUrl: "https://images.example.test/new-cover.png",
        alt: "西湖黄昏",
        variants,
      },
    });
    expect(updated.result!.structuredContent!.guide).not.toHaveProperty("itinerary");
    expect((await getGuideById(guide.id)).coverImage).toMatchObject({ variants });

    expect((await callTool(actor, "upload_image", { data: "not-an-image", alt: "bad" })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "INVALID_IMAGE" } },
    });
    expect((await callTool(actor, "upload_image", { url: "https://127.0.0.1/private.png", alt: "ssrf" })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "INVALID_URL" } },
    });
    expect((await callTool(actor, "upload_image", { url: "https://[::1]/private.png", alt: "ssrf-ipv6" })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "INVALID_URL" } },
    });
    expect((await callTool(actor, "upload_image", { url: "https://example.com/pic.png", data: validPngBase64, alt: "both" })).result?.isError).toBe(true);
    expect((await callTool(actor, "upload_image", { data: validPngBase64, alt: "rev-without-id", expectedRevision: 1 })).result?.isError).toBe(true);
  });

  it("uploads standalone attachment and attaches to existing guide with update scope", async () => {
    uploadAttachmentMock.mockResolvedValue({
      objectKey: "attachments/test-track.gpx",
      publicUrl: "https://images.example.test/test-track.gpx",
      size: 1024,
      type: "gpx",
    });
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1"><trk><name>西湖环线</name></trk></gpx>`;
    const standalone = await callTool(actor, "upload_attachment", {
      name: "西湖环线.gpx",
      type: "gpx",
      content: gpxContent,
      description: "环湖徒步航迹",
    });
    expect(standalone.result!.structuredContent!.attachment).toMatchObject({
      name: "西湖环线.gpx",
      type: "gpx",
      publicUrl: "https://images.example.test/test-track.gpx",
      description: "环湖徒步航迹",
    });

    const guide = await create();
    uploadAttachmentMock.mockResolvedValue({
      objectKey: "attachments/guide-map.pdf",
      publicUrl: "https://images.example.test/guide-map.pdf",
      size: 2048,
      type: "pdf",
    });
    const pdfBase64 = Buffer.from("%PDF-1.4 test pdf content").toString("base64");
    const attached = await callTool(actor, "upload_attachment", {
      name: "导览手册.pdf",
      type: "pdf",
      data: pdfBase64,
      guideId: guide.id,
      expectedRevision: guide.revision,
      responseMode: "summary",
    });
    expect(attached.result!.structuredContent!.attachment).toMatchObject({
      name: "导览手册.pdf",
      type: "pdf",
      publicUrl: "https://images.example.test/guide-map.pdf",
    });
    expect(attached.result!.structuredContent!.guide).toMatchObject({ id: guide.id, revision: 2 });
    const reloaded = await getGuideById(guide.id);
    expect(reloaded.attachments).toHaveLength(1);
    expect(reloaded.attachments[0].name).toBe("导览手册.pdf");

    // Scope check: attachment.upload without guide.update cannot update guide
    const attachOnly: ApiActor = { ...actor, scopes: ["guide.read", "attachment.upload"] };
    const deniedAttach = await callTool(attachOnly, "upload_attachment", {
      name: "测试.gpx",
      type: "gpx",
      content: gpxContent,
      guideId: guide.id,
      expectedRevision: 2,
    });
    expect(deniedAttach.status).toBe(403);
    expect(deniedAttach.headers.get("www-authenticate")).toContain('scope="guide.read attachment.upload guide.update"');

    expect((await callTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx" })).result?.isError).toBe(true);
    expect((await callTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx", content: gpxContent, url: "https://example.com/test.gpx" })).result?.isError).toBe(true);
    expect((await callTool(actor, "upload_attachment", { name: "test.gpx", type: "gpx", content: gpxContent, guideId: guide.id })).result?.isError).toBe(true);
  });

  it("rejects unknown actor kinds before registering tools or accessing database", () => {
    const unknown = { authKind: "anonymous", actorLabel: "untrusted" } as unknown as ApiActor;
    const server = new McpServer(MCP_SERVER_INFO);
    expect(() => registerGuideTools(server, unknown)).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
  });

  it.each(["upload_image", "upload_attachment"])("rejects missing and stale %s targets before downloading or uploading", async (name) => {
    const downloadImage = vi.spyOn(imageFetch, "fetchImageFromUrl").mockResolvedValue({ bytes: Buffer.from(validPngBase64, "base64"), mime: "image/png" });
    const downloadAttachment = vi.spyOn(attachmentFetch, "fetchAttachmentFromUrl").mockResolvedValue({ bytes: Buffer.from("%PDF-1.4 test"), type: "pdf", mime: "application/pdf", extension: "pdf" });
    uploadImageMock.mockResolvedValue({ objectKey: "guides/new.png", publicUrl: "https://images.example.test/new.png" });
    uploadAttachmentMock.mockResolvedValue({ objectKey: "attachments/new.pdf", publicUrl: "https://images.example.test/new.pdf", size: 13, type: "pdf" });

    const guide = await create();
    await updateGuide(guide.id, { expectedRevision: 1, title: "已由其他编辑保存" });
    const args = name === "upload_image"
      ? { url: "https://images.example.test/cover.png", alt: "封面" }
      : { url: "https://images.example.test/route.pdf", name: "路线.pdf", type: "pdf" };

    expect((await callTool(actor, name, { ...args, guideId: "0".repeat(24), expectedRevision: 1 })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 404, code: "NOT_FOUND" } },
    });
    expect((await callTool(actor, name, { ...args, guideId: guide.id, expectedRevision: 1 })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } },
    });
    expect(downloadImage).not.toHaveBeenCalled();
    expect(downloadAttachment).not.toHaveBeenCalled();
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(uploadAttachmentMock).not.toHaveBeenCalled();
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, title: "已由其他编辑保存", coverImage: draft.coverImage, attachments: [] });
  });

  it.each(["upload_image", "upload_attachment"])("preserves concurrent edits made during %s and does not replay uploads", async (name) => {
    const guide = await create();
    const concurrentEdit = () => updateGuide(guide.id, { expectedRevision: 1, title: "上传期间保存的内容" });
    uploadImageMock.mockImplementationOnce(async () => {
      await concurrentEdit();
      return { objectKey: "guides/new.png", publicUrl: "https://images.example.test/new.png" };
    });
    uploadAttachmentMock.mockImplementationOnce(async () => {
      await concurrentEdit();
      return { objectKey: "attachments/new.pdf", publicUrl: "https://images.example.test/new.pdf", size: 13, type: "pdf" };
    });
    const args = name === "upload_image"
      ? { data: validPngBase64, alt: "封面" }
      : { data: Buffer.from("%PDF-1.4 test").toString("base64"), name: "路线.pdf", type: "pdf" };

    expect((await callTool(actor, name, { ...args, guideId: guide.id, expectedRevision: 1 })).result).toMatchObject({
      isError: true,
      structuredContent: { error: { status: 409, code: "REVISION_CONFLICT" } },
    });
    expect(name === "upload_image" ? uploadImageMock : uploadAttachmentMock).toHaveBeenCalledTimes(1);
    expect(await getGuideById(guide.id)).toMatchObject({ revision: 2, title: "上传期间保存的内容", coverImage: draft.coverImage, attachments: [] });
  });

  it("checks cover replacement scope before any upload side effect", async () => {
    uploadImageMock.mockClear();
    const uploadOnly: ApiActor = { ...actor, scopes: ["guide.read", "image.upload"] };
    const denied = await callTool(uploadOnly, "upload_image", {
      data: validPngBase64,
      alt: "封面",
      guideId: "a".repeat(24),
      expectedRevision: 1,
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain('scope="guide.read image.upload guide.update"');
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it.each([
    ["create_guide", { ...draft, authKind: "session" }],
    ["get_guide", { id: { $ne: null } }],
    ["list_guides", { q: "x".repeat(201) }],
    ["list_guides", { limit: 0 }],
    ["list_guides", { limit: 101 }],
    ["list_guides", { limit: "5" }],
    ["create_guide", { ...draft, responseMode: "minimal" }],
    ["update_guide", { id: "a".repeat(24), expectedRevision: 1, status: "draft" }],
    ["publish_guide", { id: "a".repeat(24), expectedRevision: 0 }],
  ])("rejects invalid or undeclared input for %s", async (name, input) => {
    const res = await callTool(actor, name as string, input);
    expect(res.result?.isError).toBe(true);
    expect(res.result?.content[0]?.text).toContain("Input validation error");
  });
});
