import { describe, expect, it, vi, afterEach } from "vitest";
import { assertAdmin, assertAdminOrToken, isValidApiToken, logAdminAction, safeTokenCompare, verifyApiToken } from "@/lib/admin";

function unauthorized(session: Parameters<typeof assertAdmin>[0]) {
  try {
    assertAdmin(session);
    return null;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("server admin guard", () => {
  it("accepts only the configured fixed administrator", () => {
    expect(() => assertAdmin({ user: { id: "admin", email: "admin@example.test" } })).not.toThrow();
    expect(unauthorized(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(unauthorized({ user: { id: "other", email: "admin@example.test" } })).toMatchObject({ status: 401 });
    expect(unauthorized({ user: { id: "admin", email: "visitor@example.test" } })).toMatchObject({ status: 401 });
  });

  it("performs constant-time safe token comparison", () => {
    expect(safeTokenCompare("secret1234567890", "secret1234567890")).toBe(true);
    expect(safeTokenCompare("secret1234567890", "secret1234567891")).toBe(false);
    expect(safeTokenCompare("short", "secret1234567890")).toBe(false);
  });

  it("validates Bearer token headers strictly", () => {
    vi.stubEnv("HERMES_API_TOKEN", "valid-hermes-token-12345");

    expect(isValidApiToken("Bearer valid-hermes-token-12345")).toBe(true);
    expect(isValidApiToken("Bearer wrong-token-12345")).toBe(false);
    expect(isValidApiToken("Basic dXNlcjpwYXNz")).toBe(false);
    expect(isValidApiToken(null)).toBe(false);

    expect(() => verifyApiToken("Bearer valid-hermes-token-12345")).not.toThrow();
    expect(() => verifyApiToken("Bearer wrong-token-12345")).toThrow("无效的 API Token");
    expect(() => verifyApiToken("Basic invalid")).toThrow("Authorization 格式需为 Bearer <TOKEN>");
    expect(() => verifyApiToken(null)).toThrow("缺少 Authorization 请求头");

    vi.stubEnv("HERMES_API_TOKEN", "");
    vi.stubEnv("API_TOKEN", "");
    expect(() => verifyApiToken("Bearer valid-hermes-token-12345")).toThrow("服务端未配置 API Token");
  });

  it("authenticates requests with valid API Token in assertAdminOrToken", () => {
    vi.stubEnv("HERMES_API_TOKEN", "my-test-token-at-least-16-chars");
    vi.stubEnv("ADMIN_EMAIL", "admin@example.test");

    const result = assertAdminOrToken(null, "Bearer my-test-token-at-least-16-chars");
    expect(result).toMatchObject({
      user: { id: "admin", email: "admin@example.test" },
      authKind: "token",
      actorLabel: "api-token",
    });

    expect(() => assertAdminOrToken(null, "Bearer wrong-token-at-least-16-chars")).toThrow();
    expect(() => assertAdminOrToken(null, null)).toThrow();
    const session = { user: { id: "admin", email: "admin@example.test" } };
    expect(() => assertAdminOrToken(session, "Bearer wrong-token-at-least-16-chars")).toThrow();
    expect(() => assertAdminOrToken(session, "")).toThrow("Authorization 格式需为 Bearer <TOKEN>");
    expect(assertAdminOrToken(session, null)).toMatchObject({
      user: { id: "admin" }, authKind: "session", actorLabel: "admin@example.test",
    });
  });

  it("logs only server-derived attribution and revision metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const actor = {
      user: { id: "admin", email: "admin@example.test" },
      authKind: "token" as const,
      actorLabel: "api-token",
    };

    logAdminAction(actor, "guide.update", "guide-1", 2, 3);

    expect(info).toHaveBeenCalledWith("admin_action", expect.objectContaining({
      requestId: expect.any(String),
      action: "guide.update",
      authKind: "token",
      actorLabel: "api-token",
      guideId: "guide-1",
      beforeRevision: 2,
      afterRevision: 3,
      result: "success",
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain("my-test-token");
    info.mockImplementationOnce(() => { throw new Error("sink failed"); });
    expect(() => logAdminAction(actor, "guide.update", "guide-1", 2, 3)).not.toThrow();
  });
});
