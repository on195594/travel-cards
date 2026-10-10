import type { AdminActor } from "@/lib/admin";
import { HttpError } from "@/lib/http";

export const AI_GUIDE_SCOPES = ["guide.read", "guide.create", "guide.update", "guide.publish"] as const;
export type AiGuideScope = typeof AI_GUIDE_SCOPES[number];

// This is an authenticated principal, never a role supplied in a request body or header.
export type ApiActor = AdminActor | { authKind: "restricted-ai"; actorLabel: string; scopes: readonly AiGuideScope[] };
export type ApiCapability =
  | "guide.read" | "guide.create" | "guide.update" | "guide.publish"
  | "guide.unpublish" | "guide.delete" | "image.upload" | "assistant.use" | "config.manage";

const grants: Record<ApiCapability, readonly ApiActor["authKind"][]> = {
  "guide.read": ["session", "token", "restricted-ai"],
  "guide.create": ["session", "token", "restricted-ai"],
  "guide.update": ["session", "token", "restricted-ai"],
  "guide.publish": ["session", "token", "restricted-ai"],
  "guide.unpublish": ["session", "token"],
  "guide.delete": ["session", "token"],
  "image.upload": ["session", "token"],
  "assistant.use": ["session", "token"],
  "config.manage": ["session"],
};

export function hasCapability(actor: ApiActor, capability: ApiCapability): boolean {
  if (!Object.hasOwn(grants, capability) || !grants[capability].includes(actor.authKind)) return false;
  return actor.authKind !== "restricted-ai" || (Array.isArray(actor.scopes) && actor.scopes.some((scope) => scope === capability));
}

export function assertCapability(actor: ApiActor, capability: ApiCapability): void {
  if (!hasCapability(actor, capability)) {
    throw new HttpError(403, "FORBIDDEN", "当前身份无权执行此操作");
  }
}
