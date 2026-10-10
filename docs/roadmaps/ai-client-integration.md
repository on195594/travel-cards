# 外部 AI / MCP 接入路线图

实现状态更新：2026-10-10。Gemini 官方帮助最近核实：2026-10-09。

本文件维护当前状态与下一步，不作为部署、凭证变更、真实服务调用或外部写入的授权。产品与权限契约以 `SPEC.md` 3.3 为准；认证细节与历史本地验证见 [认证决定](../decisions/2026-10-09-gemini-mcp-auth.md)。

## 产品边界

- 保留管理员 Session 和既有受信任自动化 Token 的完整原有能力，包括删除；现有 Token 不是受限 AI 凭证。
- 受限外部 AI 可读取、创建、修改和直接发布同一份 Guide，不额外要求应用内逐篇审批。仍遵守客户端写入确认、完整性校验、slug 约束、revision 冲突和审计。
- 受限 AI 不得删除或管理配置；撤回、上传图片未获批准，默认拒绝。应用内 Gemini 仍只生成候选或问答，不自主写库。
- 外部来源 URL 仅为客户端提供的引用，不能自动标记为 Gemini grounding 已验证。不新建重复 Card 内容模型或 Agent 框架。

## 仓库实现与验收状态

| 能力 | 已实现 | 尚未完成 |
| --- | --- | --- |
| 管理 API 权限 | 显式能力检查；原 Session/Token 兼容性回归 | 受限凭证未接入管理员 REST；不能把既有 Token 给 AI |
| Guide MCP 工具核心 | list/get/create/update/publish，共享 schema、业务服务与审计 | 业务 HTTP/协议 adapter 与错误映射 |
| 受限访问令牌 | 内部签发、15 分钟有效期、摘要存储、精确 resource、scopes 和持久化撤销 | 客户端注册、管理员同意、OAuth 授权码；无公网签发入口 |
| OAuth/DCR | 实现方向已确认 | 发现元数据、DCR 与限额、S256 PKCE、一次性码、同意/长期授权撤销界面 |
| 连接探针 | `/api/mcp-probe` 固定数据工具及公开部署记录 | 不提供认证或业务能力，不替代 Gemini 双端验收 |
| 非敏感配置后台 | 管理员专属能力策略 | 字段清单、存储与管理界面 |

`restricted-ai` 的有效权限为角色上界与实际 scopes 的交集。缺少 scopes 默认拒绝；发现工具时过滤并不替代调用时鉴权。内部令牌仅绑定 `AUTH_URL` 对应的 `/api/mcp`；每次认证查询过期/撤销状态，不依赖 TTL 及时删除。撤销针对该短效记录，不能取消已认证的在途操作，也不代表长期 Google 账号关联已可撤销。当前没有 refresh token。

源实现已提交至 `7cc88f8`；该提交获得真实 AGY 的 **APPROVE**，范围仅为内部底座，证据见 [审查记录](../reviews/agy-7cc88f8/closeout.md)。后续文档/测试清理不改变运行时代码，也不扩大该审查结论的范围。

## Gemini 官方能力与约束

官方依据：[Connect & manage custom apps for Gemini Apps](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en)。最近核实的原文说明：

1. 网页添加 MCP server URL，连接后可在网页和手机 App 使用；添加操作只在网页端。
2. 当时要求美国地区、18 岁以上、个人 Google 账号、开启 Keep Activity；仅支持英文，不支持工作/学校账号。
3. 原始 HTML 的连接步骤明确：不支持 Dynamic Client Registration（DCR）时才需展开高级选项填写客户端凭证。此前 readable 提取遗漏了此步骤，现已纠正。
4. MCP 必须符合标准；Gemini 要求手动确认写操作。应用的直接发布能力不得绕过该确认。
5. Gemini 可能把对话及其他上下文传给第三方应用，管理员应理解并监督其访问范围。

用户已确认添加入口可见，截图中的高级选项显示 OAuth Client ID / Client secret。**这不是认证握手或连接成功证据。** 按官方原文和 [MCP Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) 开发，不再以逐屏截图为前置条件；不得用 Gemini API/CLI 或 Enterprise 文档代替 Gemini Apps 的验收契约。地区及功能限制在真实验收时需重新核实。

## 公开探针与生产版本

- 联调 URL：`https://travel.keyi.win/api/mcp-probe`。唯一工具 `connection_check` 无参数，只返回固定非敏感信息，无数据库/应用凭证/外部服务依赖。
- 实现是无状态 Streamable HTTP 的直接 JSON 响应；不提供 SSE 长连接、OAuth、业务资源或写工具。公开无认证仅适用于此合成探针，不是业务 MCP 的认证方案。
- 2026-10-09 按授权从 `c912c47` 加单个探针路由构建部署，曾完成公网协议 smoke。历史镜像、临时构建及回滚记录保留在 Git 中当日版本，不当作当前生产事实。
- 2026-10-10 只读核对：当前容器使用 `travel-cards-web`，image ID `sha256:3db6a4206c751c927ed250a6c19971fe32ae91b244347fe1d1e591f0d58dcfdd`；首页 GET 为 200，探针 GET 为预期的 405。镜像未提供源提交标签，**不能据此确认线上对应哪个 Git 提交或哪些内部模块已部署**。
- 原探针回滚标签 `travel-cards-web:before-mcp-probe-20261009-6r4x61` 已不存在，旧临时 helper 也不适配当前镜像。已移除过时操作指令和临时产物；回滚前需重新明确目标镜像/提交及配置，获得授权后执行，不能照抄旧命令。

## 下一批实施顺序

1. **OAuth 接入层**：客户端注册与有界元数据校验、HTTPS redirect URI 精确匹配、注册限额；资源/授权服务器发现；S256 PKCE 一次性短效码与管理员明确同意。DCR 注册本身不授予内容权限，clientId 不能自报即获授权。
2. **授权生命周期**：接入内部访问令牌底座，补长期客户端授权撤销及管理员界面。若增加 refresh，必须落实轮换、重用检测和撤销；不绕过已有 scopes/resource 约束。
3. **业务 MCP HTTP**：复用五个工具及能力策略，正确区分协议错误和 `isError: true` 业务错误，保留 `REVISION_CONFLICT` 信息，不自动重试覆盖。以 fake 客户端验证 REST/MCP 绕过、重放、并发及撤销后的拒绝。
4. **部署与 Gemini 双端验收**：权限、输入、脱敏日志及授权撤销全部通过后，另行授权部署。由用户完成必要的账号授权；网页/原生手机调用、发布确认、冲突和来源展示均保留真实证据。
5. **非敏感配置管理**：字段确认后增加管理员专属界面及服务端检查，不展示或修改环境凭证。

默认测试使用隔离 MongoDB 和 fake 身份/transport，不依赖真实 Gemini/R2。完整 OAuth、业务 MCP 和双端验收仍 **pending**，未满足门槛前不开放业务写入。
