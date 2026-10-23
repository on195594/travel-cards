import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const mocks = vi.hoisted(() => ({ listPublishedGuides: vi.fn(), listPublishedDestinations: vi.fn() }));
vi.mock("@/lib/guides", () => mocks);
import Home from "@/app/page";

afterEach(() => vi.resetAllMocks());

describe("homepage search recovery", () => {
  it("keeps destination shortcuts when only the initial search fails", async () => {
    mocks.listPublishedGuides.mockRejectedValue(new HttpError(400, "SEARCH_QUERY_TOO_LONG", "搜索关键词不能超过 200 个字符"));
    mocks.listPublishedDestinations.mockResolvedValue(["杭州", "成都"]);
    const html = renderToString(await Home({ searchParams: Promise.resolve({ q: "x".repeat(201) }) })).replace(/<!--[\s\S]*?-->/g, "");
    expect(html).toContain("搜索暂时不可用");
    expect(html).toContain("2 个目的地");
    expect(html).toContain(">杭州</button>");
    expect(html).toContain(">成都</button>");
  });

  it("preserves normal homepage errors and reports an unavailable initial search", async () => {
    const error = new Error("database unavailable");
    mocks.listPublishedGuides.mockRejectedValue(error);
    await expect(Home({})).rejects.toBe(error);
    mocks.listPublishedDestinations.mockRejectedValue(error);
    const html = renderToString(await Home({ searchParams: Promise.resolve({ q: "杭州" }) }));
    expect(html).toContain("搜索暂时不可用");
    expect(html).toContain("重新搜索");
  });
});
