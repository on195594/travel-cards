export const sectionKindLabels: Record<string, string> = {
  transport: "交通出行",
  stay: "住宿推荐",
  food: "餐饮美食",
  budget: "费用预算",
  safety: "安全防范",
  other: "实用建议",
};

export function getSectionId(kind: string, index: number, allSections: Array<{ kind: string }>): string {
  const matching = allSections.filter((s) => s.kind === kind);
  if (matching.length === 1) return `section-${kind}`;
  const kindIndex = allSections.slice(0, index + 1).filter((s) => s.kind === kind).length;
  return `section-${kind}-${kindIndex}`;
}

export function getDayDisplayTitle(title: string | undefined | null, dayNum: number): string {
  if (!title) return "";
  const cleaned = title
    .replace(new RegExp(`^(?:Day\\s*${dayNum}|D\\s*${dayNum}|第\\s*${dayNum}\\s*天)[：:·\\s-]*`, "i"), "")
    .trim();
  return cleaned;
}
