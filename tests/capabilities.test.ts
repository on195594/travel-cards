import { describe, expect, it } from "vitest";
import { assertCapability, type ApiActor, type ApiCapability } from "@/lib/capabilities";

const actors: ApiActor[] = [
  { authKind: "session", actorLabel: "admin", user: { id: "admin", email: "admin@example.test" } },
  { authKind: "token", actorLabel: "api-token", user: { id: "admin", email: "admin@example.test" } },
  { authKind: "restricted-ai", actorLabel: "test-client" },
];
const matrix: [ApiCapability, boolean[]][] = [
  ["guide.read", [true, true, true]],
  ["guide.create", [true, true, true]],
  ["guide.update", [true, true, true]],
  ["guide.publish", [true, true, true]],
  ["guide.unpublish", [true, true, false]],
  ["guide.delete", [true, true, false]],
  ["image.upload", [true, true, false]],
  ["assistant.use", [true, true, false]],
  ["config.manage", [true, false, false]],
];

describe("server-side capability policy", () => {
  it.each(matrix)("enforces %s for session, trusted token and restricted AI", (capability, allowed) => {
    actors.forEach((actor, index) => {
      const check = () => assertCapability(actor, capability);
      if (allowed[index]) expect(check).not.toThrow();
      else expect(check).toThrow(expect.objectContaining({ status: 403, code: "FORBIDDEN" }));
    });
  });

  it("fails closed for unknown capabilities and identity kinds", () => {
    for (const capability of ["guide.destroy", "toString", "__proto__"]) {
      expect(() => assertCapability(actors[0], capability as ApiCapability)).toThrow(expect.objectContaining({ status: 403 }));
    }
    const unknown = { authKind: "owner", actorLabel: "unrecognized" } as unknown as ApiActor;
    expect(() => assertCapability(unknown, "guide.read")).toThrow(expect.objectContaining({ status: 403 }));
  });
});
