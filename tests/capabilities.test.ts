import { describe, expect, it } from "vitest";
import { assertCapability, type ApiActor, type ApiCapability } from "@/lib/capabilities";

const actors: ApiActor[] = [
  { authKind: "session", actorLabel: "admin", user: { id: "admin", email: "admin@example.test" } },
  { authKind: "token", actorLabel: "api-token", user: { id: "admin", email: "admin@example.test" } },
  { authKind: "restricted-ai", actorLabel: "test-client", scopes: ["guide.read", "guide.create", "guide.update", "guide.publish"] },
];
const matrix: [ApiCapability, boolean[]][] = [
  ["guide.read", [true, true, true]],
  ["guide.create", [true, true, true]],
  ["guide.update", [true, true, true]],
  ["guide.publish", [true, true, true]],
  ["guide.unpublish", [true, true, false]],
  ["guide.delete", [true, true, false]],
  ["image.upload", [true, true, false]],
  ["attachment.upload", [true, true, false]],
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

  it("enforces granted scopes as well as role, including missing scopes", () => {
    const readOnly: ApiActor = { authKind: "restricted-ai", actorLabel: "readonly", scopes: ["guide.read"] };
    expect(() => assertCapability(readOnly, "guide.read")).not.toThrow();
    for (const capability of ["guide.create", "guide.update", "guide.publish", "guide.delete", "config.manage"] as const) {
      expect(() => assertCapability(readOnly, capability)).toThrow(expect.objectContaining({ status: 403 }));
    }
    const uploader: ApiActor = { authKind: "restricted-ai", actorLabel: "uploader", scopes: ["guide.read", "image.upload"] };
    expect(() => assertCapability(uploader, "image.upload")).not.toThrow();
    expect(() => assertCapability(uploader, "guide.create")).toThrow(expect.objectContaining({ status: 403 }));
    const attachmentUploader: ApiActor = { authKind: "restricted-ai", actorLabel: "attachment-uploader", scopes: ["guide.read", "attachment.upload"] };
    expect(() => assertCapability(attachmentUploader, "attachment.upload")).not.toThrow();
    expect(() => assertCapability(attachmentUploader, "guide.create")).toThrow(expect.objectContaining({ status: 403 }));
    const missing = { authKind: "restricted-ai", actorLabel: "no-grant" } as ApiActor;
    expect(() => assertCapability(missing, "guide.read")).toThrow(expect.objectContaining({ status: 403 }));
    const forged = { ...readOnly, scopes: ["guide.delete", "config.manage"] } as unknown as ApiActor;
    expect(() => assertCapability(forged, "guide.delete")).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertCapability(forged, "config.manage")).toThrow(expect.objectContaining({ status: 403 }));
  });

  it("fails closed for unknown capabilities and identity kinds", () => {
    for (const capability of ["guide.destroy", "toString", "__proto__"]) {
      expect(() => assertCapability(actors[0], capability as ApiCapability)).toThrow(expect.objectContaining({ status: 403 }));
    }
    const unknown = { authKind: "owner", actorLabel: "unrecognized" } as unknown as ApiActor;
    expect(() => assertCapability(unknown, "guide.read")).toThrow(expect.objectContaining({ status: 403 }));
  });
});
