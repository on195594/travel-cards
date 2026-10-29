# 外部 AI / MCP 接入路线图

更新：2026-10-29。产品与权限契约以 `SPEC.md` 3.3 为准；认证设计见[认证决定](../decisions/2026-10-09-gemini-mcp-auth.md)，协议见[2026 协议决定](../decisions/2026-10-21-mcp-2026-migration.md)，部署状态见 [README](../../README.md#当前状态)。本文件不授权部署、凭证变更或真实服务调用。

## 产品边界

- 保留管理员 Session 和既有受信任自动化 Token 的完整原有能力，包括删除；现有 Token 不是受限 AI 凭证。
- 受限外部 AI 可读取、创建、修改和直接发布同一份 Guide，不额外要求应用内逐篇审批。仍遵守客户端写入确认、完整性校验、slug 约束、revision 冲突和审计。
- 受限 AI 不得删除或管理配置；撤回仍默认拒绝；图片与附件上传已获批准并实现，分别需要 `image.upload` 与 `attachment.upload`，直接替换封面或追加附件还需 `guide.update` 与 expectedRevision。应用内 Gemini 仍只生成候选或问答，不自主写库。
- 外部来源 URL 仅为客户端提供的引用，不能自动标记为 Gemini grounding 已验证。不新建重复 Card 内容模型或 Agent 框架。

## 实现状态

| 能力 | 状态 |
| --- | --- |
| 管理 API 权限 | 显式能力检查；受限凭证不能调用管理员 REST，既有 Token 不能给 AI |
| MCP 工具 | 七个工具，`/mcp` 双协议；`list_guides` 可选 limit、写工具可选 summary |
| 受限访问令牌 | 授权码换取，100 × 365 天，精确 resource/scopes，逐次检查客户端撤销；无 refresh token |
| OAuth/DCR | 注册限额、S256 PKCE、一次性码、管理员同意与撤销；生产已启用，新环境默认关闭 |
| 连接探针 | `/api/mcp-probe` 固定数据，无认证与业务能力 |
| 非敏感配置后台 | 未实现，等待具体字段需求 |

`restricted-ai` 的有效权限为角色上界与实际 scopes 的交集；缺少 scopes 默认拒绝，工具发现时的过滤不替代调用时鉴权。

## 真实客户端验收

- 2026-10-12 用户确认旧协议下 Gemini 网页／手机双端验收完成（依据为用户结论，未覆盖图片上传、冲突、撤销等专项）。
- 2026 协议（`0dfe091` 起）及 10-29 执行优化尚未在真实 Gemini 上重新验收：下一步由用户在网页／手机完成授权、读取、修改、发布、图片、409 与撤销，并记录耗时与确认次数。

## Gemini 官方能力与约束

官方依据：[Connect & manage custom apps for Gemini Apps](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en)。最近核实的原文说明：

1. 网页添加 MCP server URL，连接后可在网页和手机 App 使用；添加操作只在网页端。
2. 当时要求美国地区、18 岁以上、个人 Google 账号、开启 Keep Activity；仅支持英文，不支持工作/学校账号。
3. 原始 HTML 的连接步骤明确：不支持 Dynamic Client Registration（DCR）时才需展开高级选项填写客户端凭证。此前 readable 提取遗漏了此步骤，现已纠正。
4. MCP 必须符合标准；Gemini 要求手动确认写操作。应用的直接发布能力不得绕过该确认。
5. Gemini 可能把对话及其他上下文传给第三方应用，管理员应理解并监督其访问范围。

此前用户确认添加入口可见，截图中的高级选项显示 OAuth Client ID / Client secret；该截图本身不是认证握手或连接成功证据。按官方原文和 [MCP Authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) 开发，不再以逐屏截图为前置条件；不得用 Gemini API/CLI 或 Enterprise 文档代替 Gemini Apps 的验收契约。地区及功能限制在真实验收时需重新核实。

## 历史

DCR 增量、本地 OAuth 闭环、首次上线、`/api/mcp` → `/mcp` 路由迁移等阶段记录见 `git log -- docs/roadmaps/ai-client-integration.md`。
