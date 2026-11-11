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
  it("negotiates protocol version and handles initialize, notification, tools/list, and connection_check", async () => {
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1" },
    });
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("cache-control")).toBe("no-store");
    expect(initialized.headers.has("mcp-session-id")).toBe(false);
    expect((await initialized.json()).result).toMatchObject({
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
    });

    const notification = await POST(new Request(url, {
      method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }));
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");

    const versionHeader = { "mcp-protocol-version": "2025-11-25" };
    const listed = await (await rpc("tools/list", {}, versionHeader)).json();
    expect(listed.result.tools).toHaveLength(1);
    expect(listed.result.tools[0]).toMatchObject({
      name: "connection_check",
      inputSchema: { additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
    });

    const called = await (await rpc("tools/call", { name: "connection_check", arguments: {} }, versionHeader)).json();
    expect(called.result).toMatchObject({ isError: false });
    expect(called.result.content[0].text).toContain("Synthetic test only");

    // Negotiates unknown version to default and responds to ping
    const fallback = await rpc("initialize", { protocolVersion: "future-unknown", capabilities: {}, clientInfo: { name: "client", version: "1" } });
    expect((await fallback.json()).result.protocolVersion).toBe("2025-11-25");
    expect((await (await rpc("ping")).json()).result).toEqual({});
  });

  it("rejects invalid or unsupported methods and arguments without leaking context", async () => {
    const cases = [
      { method: "tools/call", params: { name: "guide.delete", arguments: {} }, code: -32602 },
      { method: "tools/call", params: { name: "connection_check", arguments: { prompt: "private-input" } }, code: -32602 },
      { method: "tools/list", params: { cursor: "private-cursor" }, code: -32602 },
      { method: "guide.delete", params: {}, code: -32601 },
      { method: "resources/read", params: { uri: "file:///etc/passwd" }, code: -32601 },
    ];
    for (const { method, params, code } of cases) {
      const response = await rpc(method, params);
      const body = await response.json();
      expect(body.error.code).toBe(code);
      expect(JSON.stringify(body)).not.toContain("private-");
      expect(JSON.stringify(body)).not.toContain("/etc/passwd");
    }
  });

  it("validates transport headers, origins, accept formats, and bounded payload size before parsing", async () => {
    // Rejects invalid transport headers without consuming body
    const badHeaders = [
      [{ origin: "https://evil.example" }, 403],
      [{ "mcp-protocol-version": "unsupported" }, 400],
      [{ accept: "text/plain" }, 406],
      [{ "content-type": "text/plain" }, 415],
      [{ "content-length": "8193" }, 413],
    ] as const;
    for (const [invalid, status] of badHeaders) {
      const req = new Request(url, { method: "POST", headers: { ...headers, ...invalid }, body: "{}" });
      expect((await POST(req)).status).toBe(status);
      expect(req.bodyUsed).toBe(false);
    }

    // Accepts allowed origins and compatible accept headers
    for (const origin of ["https://travel.keyi.win", "http://localhost:3000", "http://127.0.0.1:3100"]) {
      expect((await rpc("ping", {}, { origin })).status).toBe(200);
    }
    for (const accept of ["application/json", "*/*", "application/json, text/event-stream"]) {
      expect((await rpc("ping", {}, { accept })).status).toBe(200);
    }

    // Rejects oversized stream body
    const oversized = await POST(new Request(url, { method: "POST", headers: { ...headers, "content-length": "1" }, body: "x".repeat(8193) }));
    expect(oversized.status).toBe(413);
  });

  it("rejects malformed RPC messages and non-POST methods", async () => {
    for (const body of ["{", "[]", "null", '{"jsonrpc":"1.0","method":"ping","id":1}']) {
      expect((await POST(new Request(url, { method: "POST", headers, body }))).status).toBe(400);
    }
    expect((await POST(new Request(url, { method: "POST", headers, body: new Uint8Array([0xff]) }))).status).toBe(400);

    for (const handler of [GET, DELETE, PUT, PATCH, OPTIONS, HEAD]) {
      expect(handler(new Request(url)).status).toBe(405);
      expect(handler(new Request(url)).headers.get("allow")).toBe("POST");
    }
  });

  it("keeps probe implementation separate from all application modules and credentials", async () => {
    const source = await readFile("src/app/api/mcp-probe/route.ts", "utf8");
    expect(source).not.toMatch(/\bimport\s|\bimport\(|\brequire\(|process\.env|\bfetch\(/);
  });
});
