import { describe, expect, it } from "vitest";
import { getDayDisplayTitle, getSectionId, sectionKindLabels } from "@/lib/guides/navigation";

describe("guide navigation helpers", () => {
  describe("getDayDisplayTitle", () => {
    it("strips redundant Day prefix when present", () => {
      expect(getDayDisplayTitle("Day 1：极速抵汉 · 双年展", 1)).toBe("极速抵汉 · 双年展");
      expect(getDayDisplayTitle("Day 2: 武汉光谷空轨", 2)).toBe("武汉光谷空轨");
      expect(getDayDisplayTitle("D1 宽窄巷子", 1)).toBe("宽窄巷子");
      expect(getDayDisplayTitle("第 1 天 · 锦里夜市", 1)).toBe("锦里夜市");
      expect(getDayDisplayTitle("第1天：宽窄巷子", 1)).toBe("宽窄巷子");
    });

    it("preserves title when no prefix exists", () => {
      expect(getDayDisplayTitle("宽窄巷子与武侯祠", 1)).toBe("宽窄巷子与武侯祠");
      expect(getDayDisplayTitle("九寨沟全天深度游", 2)).toBe("九寨沟全天深度游");
    });

    it("returns empty string when title is only the prefix or empty", () => {
      expect(getDayDisplayTitle("第 1 天", 1)).toBe("");
      expect(getDayDisplayTitle("Day 1", 1)).toBe("");
      expect(getDayDisplayTitle("D1", 1)).toBe("");
      expect(getDayDisplayTitle("", 1)).toBe("");
      expect(getDayDisplayTitle(undefined, 1)).toBe("");
      expect(getDayDisplayTitle(null, 1)).toBe("");
    });
  });

  describe("getSectionId", () => {
    it("generates clean section ID when kind is unique", () => {
      const sections = [{ kind: "transport" }, { kind: "stay" }, { kind: "food" }];
      expect(getSectionId("transport", 0, sections)).toBe("section-transport");
      expect(getSectionId("stay", 1, sections)).toBe("section-stay");
      expect(getSectionId("food", 2, sections)).toBe("section-food");
    });

    it("disambiguates section IDs when duplicate kinds exist", () => {
      const sections = [{ kind: "other" }, { kind: "transport" }, { kind: "other" }];
      expect(getSectionId("other", 0, sections)).toBe("section-other-1");
      expect(getSectionId("transport", 1, sections)).toBe("section-transport");
      expect(getSectionId("other", 2, sections)).toBe("section-other-2");
    });
  });

  describe("sectionKindLabels", () => {
    it("contains translations for all six supported kinds", () => {
      expect(sectionKindLabels).toEqual({
        transport: "交通出行",
        stay: "住宿推荐",
        food: "餐饮美食",
        budget: "费用预算",
        safety: "安全防范",
        other: "实用建议",
      });
    });
  });
});
