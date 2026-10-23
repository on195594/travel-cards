import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { PassThrough } from "node:stream";
import type { LookupFunction } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchImageFromUrl } from "@/lib/storage/fetch-image";
import { MAX_FILE_BYTES } from "@/lib/storage/r2";

const transport = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: transport.lookup }));
vi.mock("node:https", () => ({ get: transport.get }));

const png = Buffer.from("89504e470d0a1a0a", "hex");
type Reply = { status?: number; headers?: Record<string, string>; body?: Buffer; stall?: boolean };
let replies: Reply[];
let connected: string[];
let responses: PassThrough[];

beforeEach(() => {
  vi.resetAllMocks();
  replies = [];
  connected = [];
  responses = [];
  transport.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  transport.get.mockImplementation((url: URL, options: { lookup: LookupFunction; signal: AbortSignal }, onResponse: (response: IncomingMessage) => void) => {
    const request = new EventEmitter();
    let response: PassThrough | undefined;
    const abort = () => {
      request.emit("error", options.signal.reason);
      response?.destroy(options.signal.reason);
    };
    options.signal.addEventListener("abort", abort, { once: true });
    const connect = (error: Error | null, address: string) => {
      if (error) {
        options.signal.removeEventListener("abort", abort);
        request.emit("error", error);
        return;
      }
      connected.push(address);
      const reply = replies.shift() ?? {};
      response = new PassThrough();
      responses.push(response);
      response.once("close", () => options.signal.removeEventListener("abort", abort));
      onResponse(Object.assign(response, { statusCode: reply.status ?? 200, headers: reply.headers ?? {} }) as unknown as IncomingMessage);
      if (!reply.stall) response.end(reply.body ?? png);
    };
    queueMicrotask(() => {
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(host)) connect(null, host);
      else options.lookup(host, { all: true }, (error, address) => connect(error, typeof address === "string" ? address : address[0]?.address));
    });
    return request;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("public HTTPS image download with fake DNS and TLS transport", () => {
  it("blocks private, reserved, mapped and tunnel literals before connecting", async () => {
    for (const host of ["localhost.", "db.internal", "127.1", "0x7f000001", "10.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "240.0.0.1", "[::1]", "[::ffff:127.0.0.1]", "[::ffff:c0a8:1]", "[fe90::1]", "[fc00::1]", "[64:ff9b::7f00:1]", "[2002:7f00:1::]", "[2001:db8::1]", "[3fff::1]"]) {
      await expect(fetchImageFromUrl(`https://${host}/cover.png`)).rejects.toMatchObject({ code: "INVALID_URL" });
    }
    for (const url of ["http://example.test/p.png", "https://user:pass@example.test/p.png"]) {
      await expect(fetchImageFromUrl(url)).rejects.toMatchObject({ code: "INVALID_URL" });
    }
    expect(transport.get).not.toHaveBeenCalled();
  });

  it("rejects private DNS answers even when a public answer is first", async () => {
    transport.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }, { address: "::ffff:7f00:1", family: 6 }]);
    await expect(fetchImageFromUrl("https://images.example.test/cover.png")).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(connected).toEqual([]);
  });

  it("pins the checked answer and keeps the URL hostname for TLS", async () => {
    transport.lookup.mockResolvedValueOnce([{ address: "2606:4700::1111", family: 6 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(fetchImageFromUrl("https://images.example.test/cover.png")).resolves.toEqual({ bytes: png, mime: "image/png" });
    expect(transport.lookup).toHaveBeenCalledTimes(1);
    expect(connected).toEqual(["2606:4700::1111"]);
    const [url, options] = transport.get.mock.calls[0];
    expect(url.hostname).toBe("images.example.test");
    expect(options).toMatchObject({ agent: false });
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(responses[0].destroyed).toBe(true);
  });

  it("revalidates DNS on redirects and closes redirected responses", async () => {
    replies.push({ status: 302, headers: { location: "/second.png" } });
    transport.lookup.mockResolvedValueOnce([{ address: "93.184.215.14", family: 4 }]).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(fetchImageFromUrl("https://images.example.test/cover.png")).rejects.toMatchObject({ code: "INVALID_URL" });
    expect(connected).toHaveLength(1);
    expect(responses[0].destroyed).toBe(true);
  });

  it("bounds redirects and uses one deadline across the download", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    replies = Array.from({ length: 5 }, () => ({ status: 302, headers: { location: "/again.png" } }));
    await expect(fetchImageFromUrl("https://images.example.test/cover.png")).rejects.toMatchObject({ code: "IMAGE_FETCH_FAILED", message: "重定向次数过多" });
    expect(connected).toHaveLength(5);
    expect(new Set(transport.get.mock.calls.map((call) => call[1].signal)).size).toBe(1);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(15_000);
    expect(responses.every((response) => response.destroyed)).toBe(true);
  });

  it("limits both advertised and streamed bytes and validates image signatures", async () => {
    replies.push({ headers: { "content-length": String(MAX_FILE_BYTES + 1) } }, { body: Buffer.alloc(MAX_FILE_BYTES + 1) }, { body: Buffer.from("not an image") });
    for (const code of ["FILE_TOO_LARGE", "FILE_TOO_LARGE", "INVALID_IMAGE"]) {
      await expect(fetchImageFromUrl("https://images.example.test/cover.png")).rejects.toMatchObject({ code });
    }
    expect(responses.every((response) => response.destroyed)).toBe(true);
  });

  it("terminates a stalled DNS lookup or response without exposing network errors", async () => {
    for (const stage of ["dns", "body"]) {
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      transport.lookup.mockImplementation(() => stage === "dns" ? new Promise(() => {}) : Promise.resolve([{ address: "93.184.215.14", family: 4 }]));
      replies.push({ stall: true });
      const pending = fetchImageFromUrl("https://images.example.test/cover.png");
      const assertion = expect(pending).rejects.toMatchObject({ code: "IMAGE_FETCH_FAILED", message: "获取图片超时，请重试" });
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort(new Error("internal network detail"));
      await assertion;
    }
  });
});
