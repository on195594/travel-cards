# Gemini Apps MCP：以官方文档驱动接入

日期：2026-10-09。状态：确定 OAuth + DCR 实现方向；授权服务和业务 HTTP endpoint 尚未实现、未部署。本文不是新一轮生产部署或凭证变更授权。

## 官方依据与提取纠正

直接读取 [Gemini Apps 官方帮助](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en) 的原始 HTML。此前 readable 提取遗漏了折叠的连接步骤，不能把提取结果缺失当作官方未说明。

“Connect a custom app” 中明确写道：

> If the server doesn’t support Dynamic Client Registration, next to “Advanced features,” click **Show more**, then enter your credentials.

因此：DCR 是官方支持的接入路径；不支持 DCR 时才需要手动填写客户端凭证。用户截图显示的 OAuth Client ID / Client secret 是该手动配置界面，不能当作必须手动输入的证明，也不能填入应用管理员 Token。官方该段未给出固定 redirect URI、具体 grant/token 客户端认证方式或 Gemini 对全部标准版本的兼容矩阵；不从论坛经验猜这些值。

后续依据：

- [MCP Authorization 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)：OAuth、保护资源发现、授权服务器发现、客户端注册、PKCE 和资源绑定。
- [MCP Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)：工具 schema、调用结果与错误语义。
- [Google Account Linking 帮助](https://support.google.com/accounts/answer/13867826?hl=en)：用户同意、访问范围、解除关联；这是用户帮助，不替代服务端协议规范。

Gemini Enterprise、Gemini CLI、Gemini API 和 Google 社区论坛不作为 Gemini Apps 的兼容性契约。搜索仅用于定位，最终结论以官方原文为准。

## 实现方向

优先采用标准 OAuth 发现与 DCR，避免要求用户手动传递 client secret。不再以逐屏截图作为开发前置条件；客户端差异留到完整实现后的真实握手验证。

1. **资源服务器**：正式业务 MCP 与公开探针分离。无凭证返回 401 和 `WWW-Authenticate` 的 `resource_metadata`，提供 RFC 9728 保护资源元数据；绑定精确 MCP resource/audience。不能接受旧管理员 Token 或来自其他资源的令牌，也不能把外部令牌转发给 Gemini/R2。
2. **授权服务器**：提供标准授权服务器元数据，明确 authorization/token/registration endpoints 和 `code_challenge_methods_supported: ["S256"]`。Auth.js 管理员登录不是 OAuth 授权服务器，不能仅加一个 Bearer Token 字段冒充 OAuth。
3. **DCR 不等于授权**：注册仅得到客户端标识，不授予攻略权限。严格校验注册元数据、HTTPS redirect URI，后续授权/换码精确匹配；不跟随任意 metadata URL 或根据客户端名称信任其身份。注册需要配额与过期清理，避免匿名注册滥用。
4. **管理员明确授权**：已登录管理员同意具体客户端及批准的 Guide 能力；校验同源/CSRF、PKCE、一次性短效授权码及 resource。该同意是授予客户端权限，不是逐篇发布审批。客户端自己的写入确认继续保留。
5. **令牌与撤销**：短效 access token、明确 scopes/audience/到期校验和服务端授权撤销；若支持 refresh token，落实轮换与重用检测。不能在缺少撤销的情况下宣称业务接入完成。现有管理员凭证不改动、不复用。
6. **共享业务层**：只允许 list/get/create/update/publish Guide，复用现有 schema、业务服务、revision 和审计。撤回、上传、删除、配置管理及调用应用内助手不因 MCP 接入而扩大授权。

授权服务器选型与 Next.js 适配仍需落实；不把手写的部分 OAuth 实现或只有 discovery 的路由称作完整认证。Google 真实握手细节最终通过注册/授权/换码的脱敏诊断验证，不预设未经官方确认的 Google 回调地址。完整 OAuth 的实现与生产部署是后续批次，不顺带更新当前公开探针。

## 本批已实现：Guide 工具核心，未接到公网

`src/lib/mcp/guide-tools.ts` 提供五个工具定义及内部 dispatcher：

- `list_guides`、`get_guide`
- `create_guide`（支持显式直接发布）
- `update_guide`（必须带 expectedRevision）
- `publish_guide`（必须带 expectedRevision）

工具输入 JSON Schema 从现有 Zod schema 导出，额外输入严格拒绝；逐次调用仍检查服务端能力，不能靠隐藏工具代替鉴权。写操作继承现有审计，允许记录受限 AI actor。来源保留为客户端提供的引用，不自动声称已验证 grounding。

返回同时包含 `structuredContent` 和序列化 JSON 的 text content。核心层保留现有 HttpError/Zod/数据库异常，不自行重试覆盖。未来协议 adapter 必须按官方 Tools 错误规范映射：未知工具/非法协议请求是协议错误；业务和输入校验错误是 `isError: true` 工具结果。revision 冲突需保留 `409 / REVISION_CONFLICT` 的业务信息；MCP 工具结果的 HTTP 外层状态不能直接等同 REST 状态。

该模块只接受未来认证 adapter 提供的服务器侧 actor，本身不解析或验证 OAuth Token。当前没有业务 MCP HTTP 路由，也未把这些工具接到 `/api/mcp-probe`；不能把内部 actor 类型或测试 fake 当作真实受限身份。

## 验证

- `tests/mcp-guide-tools.test.ts`：16 项通过，使用 fake 已认证 actor 与隔离 MongoDB，覆盖工具列表、读写发布、审计身份、禁止能力、严格输入、完整性、slug 唯一性/不可变性及 409 不覆盖。
- `npm test`：16 个文件、154 项通过。
- `npm run lint`、`./scripts/build-with-test-env.sh`（执行生产构建及 TypeScript 检查）、`docker compose config`：通过。
- OAuth/DCR 实际握手、授权撤销、Gemini 双端验收：**NOT_RUN / 未实现**。
- 本批未部署、未调用真实 Gemini/R2、未变更凭证或生产数据；公开探针保持原固定数据版本。
