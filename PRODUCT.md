# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 旅行读者：无需登录，查找和阅读中文攻略，通过公开链接分享。
- 单一管理员：维护攻略、管理发布状态、删除内容；计划在后台管理非敏感应用配置。
- 管理员授权的外部 AI 客户端：代表管理员制作、修改和直接发布攻略。首个目标是 Gemini 网页与手机 App；也希望兼容 Codex 等主流客户端。

## Product Purpose

Travel Cards 是供人和 AI 协作维护的中文旅行攻略工作台。让攻略从对话中的建议变为结构化、可修改、可分享的逐日行程，并保持清楚的权限与来源边界。

成功标准是读者能找到并读懂攻略，管理员和授权 AI 能更新同一份内容。管理员及现有受信任自动化 Token 保留删除能力；受限 AI 身份不得删除或管理配置。权限、工具、长效令牌及 OAuth 同意撤销已实现，业务 MCP 服务端已上线并启用 OAuth。访问令牌与客户端注册默认有效期为 100 × 365 天，并非无限期；管理员可随时撤销，不支持 refresh token。Gemini 网页/手机真实双端验收已由用户确认完成；图片上传专项测试与配置后台未完成。

## Positioning

一篇 Guide 同时承载攻略、列表卡片和公开详情，不另建语义重复的 Card 数据模型。内置 AI 提供候选，外部客户端通过受鉴权接口执行内容操作，两条路径共用攻略业务规则。

## Operating Context

- 已有 Next.js 应用、管理员后台、公开页面、MongoDB 持久化、R2 图片上传与服务端 Gemini 助手。
- 路由边界：`/api/*` 是现有 REST API，正式 MCP 独立位于 `/mcp`；迁移旧 `/api/mcp` 后需重新授权，不保留业务别名。
- 现有 Bearer API Token 接口保留；MCP 固定数据探针已部署，内部攻略工具、受限令牌与本地 OAuth/DCR/PKCE 已实现，业务 MCP 服务端已上线，真实客户端验收仍待完成。
- Gemini 网页／手机 App 是首个验收目标，但客户端地区、账号及认证支持需单独验收，不能用 Gemini API 或 CLI 测试替代。
- 产品契约以 `SPEC.md` 为准。代码优先的构建默认记录在 `.impeccable/config.json`，不是产品权限或平台设置。

## Capabilities and Constraints

### 已有能力

公开浏览、关键词搜索、复制链接；详情页逐日小标题规整与全章节快速跳转导航；管理员通过 Session 或现有自动化 Token 管理攻略；结构化行程、来源、图片；revision 冲突检查；内置 AI 生成、修改建议和问答。MCP 已实现 `upload_image`，支持 HTTPS URL 或 Base64 图片输入，上传至 R2 后用于创建攻略或替换封面；需要独立 `image.upload` scope，直接替换还需要 `guide.update` 与 expectedRevision。旧注册与令牌不自动扩权或延长有效期，需重新注册并授权。

### 已确认扩展

- 保留现有 API Token 接口，包括 Token 删除攻略的能力（用户已明确确认）；增加 MCP 接入，不为每家 AI 客户端维护一份攻略模型。
- 授权外部 AI 可以读取、创建、修改及直接发布攻略，无须额外经过应用内管理员审批。
- 外部 AI 不得删除攻略或修改应用配置，不能获得数据库、R2 或服务端模型凭证。
- 管理员具备删除与非敏感配置管理权限；API Key、数据库和 R2 凭证仍来自环境变量，不在后台展示。
- 内置 Gemini 助手继续只产出待采纳候选，不借此次授权升级为自主写库代理。
- 客户端自身要求的写入确认仍需遵守。允许直接发布不等于绕过客户端安全机制。

### 尚未实现或决定

- OAuth/DCR/PKCE、管理员同意及客户端授权撤销界面已实现，上一轮已启用生产 OAuth 并部署上传工具；真实 Gemini 网页/手机双端验收已由用户确认完成，但图片上传专项测试、冲突与撤销实测未单独确认，非敏感配置后台尚未完成。
- 现有 Token 是管理员等价的自动化凭证，仍可删除；不能交给外部 AI 来满足上述受限权限目标。
- 外部 AI 图片上传与封面替换已批准并实现；撤回仍不开放。配置字段清单待确认。
- MCP 只复用应用接口和业务规则，不让模型直接访问数据库；不引入 Agent 框架或多用户发布，不另建语义重复的内容集合。令牌授权记录不是第二套 Card 模型。

## Brand Commitments

沿用 Travel Cards／旅行卡片名称，首版界面及攻略内容使用中文。本轮不重做品牌或视觉系统；没有确认新的视觉隐喻或宣传口号。

## Evidence on Hand

- 实现：`src/app/`、`src/components/`、`src/lib/`。
- 当前功能及安全契约：`SPEC.md`；入口与验证：`README.md`。
- UI 审查与部署前验证：`docs/reviews/ui-impeccable-review.md`；真实 AGY 复审原文：`docs/reviews/agy-ui-review.txt`。
- 接入状态与下一步：`docs/roadmaps/ai-client-integration.md`；认证设计与实现证据：`docs/decisions/2026-10-09-gemini-mcp-auth.md`。
- 短效令牌提交的真实 AGY 审查：`docs/reviews/agy-7cc88f8/closeout.md`；APPROVE 仅覆盖内部底座，不代表 OAuth/客户端验收完成。
- 上一轮已完成服务端测试、构建与部署，并检查健康接口及公开 OAuth challenge；真实 Gemini 网页/手机双端验收依据为 2026-10-12 用户确认记录，未提供专项证据的子项不编造已通过。

## Product Principles

1. 一份攻略，多种入口：人和 AI 修改同一份 Guide。
2. 权限依能力授予：制作与发布不意味着删除和系统管理权限。
3. 区分建议与执行：内置候选须采纳；外部已授权调用可以执行内容操作。
4. 可追溯且可校验：服务端输入校验、revision 冲突保护与操作审计不可绕过。
5. 已实现与已批准分开记录：客户端兼容性、功能及生产状态必须有实际证据。
