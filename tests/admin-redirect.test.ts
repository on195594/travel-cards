import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import AdminPage from "@/app/admin/page";

describe("admin root page", () => {
  it("redirects directly to admin guides dashboard", () => {
    AdminPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/guides");
  });
});
