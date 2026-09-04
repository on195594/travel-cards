# AGENTS.md

## Project boundary

本目录只承载 Travel Cards 应用。不得顺带修改 Hermes active skills、runtime、cron、memory、Wiki 或其他项目。

## Source of truth

1. `SPEC.md` 定义产品与安全契约。
2. `README.md` 定义阶段和项目入口。
3. 若实现需要改变行为，先更新并确认 spec，不得让代码静默偏离。

## Implementation rules

- 先读完整相关流程，再做最小实现；优先使用 Next.js、Web API、MongoDB 和现有依赖能力。
- “旅行卡片”是攻略的公开展示形态；首版不得另建语义重复的 Card 集合。
- AI 只生成草稿、建议和问答，不得自动发布、删除内容或直接写数据库。
- Gemini、Auth.js、API Token、R2 凭证只能来自环境变量，绝不进入仓库、浏览器 bundle、日志或模型提示词。
- 所有管理端写操作都必须在服务端校验管理员 session 或有效 API Token；隐藏按钮不算鉴权。
- 所有外部输入在服务端校验；富文本首版使用结构化字段或 Markdown，输出时防止 XSS。
- 不添加 Agent 框架；先用一个服务端 orchestration seam 调用 Gemini 内建工具。只有出现经验证的多模型、多代理或持久任务需求才重新评估。
- 不新增收藏、点赞、多用户发布、地图规划、支付或通知，除非 spec 另行批准（轻量搜索功能已由 SPEC.md 4.4 批准）。

## Required checks after implementation

```bash
npm test
npm run lint
npm run build
docker compose config
```

涉及 AI、鉴权或上传时，还需运行对应的最小集成测试；没有真实凭证时使用依赖注入的 fake transport，不伪造真实外部调用成功。
