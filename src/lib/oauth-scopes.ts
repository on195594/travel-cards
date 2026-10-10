import type { AiGuideScope } from "@/lib/capabilities";

export const OAUTH_SCOPE_LABELS: Record<AiGuideScope, string> = {
  "guide.read": "读取全部攻略，包括草稿",
  "guide.create": "创建攻略",
  "guide.update": "修改攻略，包括已发布内容",
  "guide.publish": "直接发布攻略",
};
