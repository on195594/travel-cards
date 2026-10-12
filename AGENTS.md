# AGENTS.md

## Project boundary

本目录只承载 Travel Cards 应用。不得顺带修改 Hermes active skills、runtime、cron、memory、Wiki 或其他项目。

## Source of truth

1. `SPEC.md` 定义产品与安全契约。
2. `README.md` 定义阶段和项目入口；`PRODUCT.md` 记录已确认产品定位，不得将待实现能力写成现有能力。
3. `docs/frontend.md` 记录现有 UI 实现事实；Impeccable 构建默认读取 `.impeccable/config.json`。初始化不等于重做视觉系统。
4. 若实现需要改变行为，先更新并确认 spec，不得让代码静默偏离。

## Implementation rules

- 先读完整相关流程，再做最小实现；优先使用 Next.js、Web API、MongoDB 和现有依赖能力。
- “旅行卡片”是攻略的公开展示形态；首版不得另建语义重复的 Card 集合。
- 应用内 Gemini 助手只生成待采纳草稿、建议和问答，不得自行发布、删除或写数据库。已批准的外部 AI 接入可以通过受限应用接口创建、修改和直接发布，但不得删除或管理配置；MCP/OAuth 受限身份及图片上传已实现，Gemini 网页/手机双端验收已由用户确认完成（记录见 docs/roadmaps/ai-client-integration.md），不据此推定各专项测试均已通过；图片需 image.upload 权限，直接替换封面还需 guide.update。现有管理员等价 API Token 不可当作受限 AI 凭证。
- Gemini、Auth.js、API Token、R2 凭证只能来自环境变量，绝不进入仓库、浏览器 bundle、日志或模型提示词。
- 所有管理端写操作都必须在服务端校验身份及对应能力；现有接口校验管理员 session 或有效 API Token，新增受限 AI 接口须落实 SPEC.md 3.3 的能力边界。隐藏按钮或不展示 MCP 工具不算鉴权。
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
