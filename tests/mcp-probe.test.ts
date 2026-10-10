import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "@/app/api/mcp-probe/route";

const url = "https://travel.keyi.win/api/mcp-probe";
const headers = { accept: "application/json, text/event-stream", "content-type": "application/json" };
function rpc(method: string, params?: unknown, extraHeaders?: Record<string, string>) {
  return POST(new Request(url, {
    method: "POST", headers: { ...headers, ...extraHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
}

describe("public synthetic MCP connectivity probe", () => {
  it.each(["2025-11-25", "2025-06-18", "2025-03-26"])("supports initialize/list/call with protocol %s", async (protocolVersion) => {
    const initialized = await rpc("initialize", { protocolVersion, capabilities: {}, clientInfo: { name: "test-client", version: "1" } });
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("cache-control")).toBe("no-store");
    expect(initialized.headers.has("mcp-session-id")).toBe(false);
    expect((await initialized.json()).result).toMatchObject({ protocolVersion, capabilities: { tools: {} } });
    const notification = await POST(new Request(url, {
      method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
    const versionHeader = { "mcp-protocol-version": protocolVersion };
    const listed = await (await rpc("tools/list", {}, versionHeader)).json();
    expect(listed.result.tools).toHaveLength(1);
    expect(listed.result.tools[0]).toMatchObject({ name: "connection_check", inputSchema: { additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } });
    const called = await (await rpc("tools/call", { name: "connection_check", arguments: {} }, versionHeader)).json();
    expect(called.result).toMatchObject({ isError: false });
    expect(called.result.content[0].text).toContain("Synthetic test only");
  });

  it("negotiates unknown versions and implements ping", async () => {
    const response = await rpc("initialize", { protocolVersion: "future", capabilities: {}, clientInfo: { name: "client", version: "1" } });
    expect((await response.json()).result.protocolVersion).toBe("2025-11-25");
    expect((await (await rpc("ping")).json()).result).toEqual({});
  });

  it.each([
    ["tools/call", { name: "guide.delete", arguments: {} }, -32602],
    ["tools/call", { name: "connection_check", arguments: { prompt: "private-input" } }, -32602],
    ["tools/call", { name: "connection_check", arguments: [] }, -32602],
    ["tools/list", { cursor: "private-input" }, -32602],
    ["initialize", { protocolVersion: "2025-11-25" }, -32602],
    ["ping", null, -32602],
    ["ping", [], -32602],
    ["guide.delete", {}, -32601],
    ["resources/read", { uri: "file:///etc/passwd" }, -32601],
  ])("rejects invalid/unsupported %s without echoing client context", async (method, params, code) => {
    const response = await rpc(method as string, params);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain("private-input");
    expect(JSON.stringify(body)).not.toContain("/etc/passwd");
  });

  it.each([
    [{ origin: "https://evil.example" }, 403],
    [{ origin: "null" }, 403],
    [{ "mcp-protocol-version": "unsupported" }, 400],
    [{ accept: "text/plain" }, 406],
    [{ "content-type": "text/plain" }, 415],
    [{ "content-length": "invalid" }, 400],
    [{ "content-length": "8193" }, 413],
  ] as const)("rejects invalid transport headers %j before consuming the body", async (invalidHeaders, status) => {
    const req = new Request(url, { method: "POST", headers: { ...headers, ...invalidHeaders }, body: "{}" });
    expect((await POST(req)).status).toBe(status);
    expect(req.bodyUsed).toBe(false);
  });

  it.each([
    "https://travel.keyi.win",
    "http://localhost:3000",
    "http://127.0.0.1:3100",
  ])("accepts allowed origin %s", async (origin) => {
    expect((await rpc("ping", {}, { origin })).status).toBe(200);
  });

  it.each([
    "application/json",
    "*/*",
    "application/json, text/event-stream",
    "application/*",
  ])("accepts compatible Accept header %s", async (accept) => {
    expect((await rpc("ping", {}, { accept })).status).toBe(200);
  });

  it.each(["{", "[]", "null", '{"jsonrpc":"1.0","method":"ping","id":1}', '{"jsonrpc":"2.0","method":"ping","id":null}'])("rejects malformed RPC %s", async (body) => {
    expect((await POST(new Request(url, { method: "POST", headers, body }))).status).toBe(400);
  });

  it("bounds actual streamed bytes even with a false Content-Length", async () => {
    const response = await POST(new Request(url, { method: "POST", headers: { ...headers, "content-length": "1" }, body: "x".repeat(8193) }));
    expect(response.status).toBe(413);
  });

  it("rejects invalid UTF-8", async () => {
    expect((await POST(new Request(url, { method: "POST", headers, body: new Uint8Array([0xff]) }))).status).toBe(400);
  });

  it.each([GET, DELETE, PUT, PATCH, OPTIONS, HEAD])("does not offer streams, session deletion or other HTTP methods", (handler) => {
    expect(handler(new Request(url)).status).toBe(405);
    expect(handler(new Request(url)).headers.get("allow")).toBe("POST");
    expect(handler(new Request(url, { headers: { origin: "https://evil.example" } })).status).toBe(403);
  });

  it("keeps probe implementation separate from all application modules and credentials", async () => {
    const source = await readFile("src/app/api/mcp-probe/route.ts", "utf8");
    expect(source).not.toMatch(/\bimport\s|\bimport\(|\brequire\(|process\.env|\bfetch\(/);
  });
});
