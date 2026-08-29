import { describe, expect, it } from "vitest";
import { assertAdmin } from "@/lib/admin";

function unauthorized(session: Parameters<typeof assertAdmin>[0]) {
  try {
    assertAdmin(session);
    return null;
  } catch (error) {
    return error;
  }
}

describe("server admin guard", () => {
  it("accepts only the configured fixed administrator", () => {
    expect(() => assertAdmin({ user: { id: "admin", email: "admin@example.test" } })).not.toThrow();
    expect(unauthorized(null)).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(unauthorized({ user: { id: "other", email: "admin@example.test" } })).toMatchObject({ status: 401 });
    expect(unauthorized({ user: { id: "admin", email: "visitor@example.test" } })).toMatchObject({ status: 401 });
  });
});
