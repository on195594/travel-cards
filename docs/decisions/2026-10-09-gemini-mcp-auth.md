# Gemini Apps MCP：以官方文档驱动接入

初始日期：2026-10-09；状态对齐：2026-10-12。OAuth/DCR/PKCE 与业务 MCP 已上线；真实 Gemini 网页/手机双端验收已完成（用户确认），依据与范围见[接入路线图](../roadmaps/ai-client-integration.md#真实客户端验收)。本文不是新一轮生产部署或凭证变更授权。

下文保留各批次的历史设计与验证，包括短效令牌、五个工具、未验收及 NOT_RUN 等当时状态，不代表当前状态；现行期限、工具范围及剩余事项以接入路线图为准。

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

本地授权服务器采用已安装 `@node-oauth/oauth2-server` 并完成 Next.js 适配、S256 PKCE、一次性码及管理员同意/撤销；仅有 discovery 或注册仍不构成内容授权，也不代表完整业务 MCP 接入。Google 真实握手细节最终通过注册/授权/换码的脱敏诊断验证，不预设未经官方确认的 Google 回调地址。业务 MCP 协议已本地接入；扩展审查与生产上线在本批门禁内进行，不顺带更新当前公开探针。

## 首批已实现：Guide 工具核心，未接到公网

`src/lib/mcp/guide-tools.ts` 提供五个工具定义及内部 dispatcher：

- `list_guides`、`get_guide`
- `create_guide`（支持显式直接发布）
- `update_guide`（必须带 expectedRevision）
- `publish_guide`（必须带 expectedRevision）

工具输入 JSON Schema 从现有 Zod schema 导出，额外输入严格拒绝；逐次调用仍检查服务端能力，不能靠隐藏工具代替鉴权。写操作继承现有审计，允许记录受限 AI actor。来源保留为客户端提供的引用，不自动声称已验证 grounding。

返回同时包含 `structuredContent` 和序列化 JSON 的 text content。核心层保留现有 HttpError/Zod/数据库异常，不自行重试覆盖。未来协议 adapter 必须按官方 Tools 错误规范映射：未知工具/非法协议请求是协议错误；业务和输入校验错误是 `isError: true` 工具结果。revision 冲突需保留 `409 / REVISION_CONFLICT` 的业务信息；MCP 工具结果的 HTTP 外层状态不能直接等同 REST 状态。

该模块只接受未来认证 adapter 提供的服务器侧 actor，本身不解析或验证 OAuth Token。该首批当时没有业务 MCP HTTP 路由，也未把这些工具接到 `/api/mcp-probe`；不能把内部 actor 类型或测试 fake 当作真实受限身份。

## 首批验证（2026-10-09）

- `tests/mcp-guide-tools.test.ts`：16 项通过，使用 fake 已认证 actor 与隔离 MongoDB，覆盖工具列表、读写发布、审计身份、禁止能力、严格输入、完整性、slug 唯一性/不可变性及 409 不覆盖。
- `npm test`：16 个文件、154 项通过。
- `npm run lint`、`./scripts/build-with-test-env.sh`（执行生产构建及 TypeScript 检查）、`docker compose config`：通过。
- OAuth/DCR 实际握手、授权撤销、Gemini 双端验收：**NOT_RUN / 未实现**。
- 本批未部署、未调用真实 Gemini/R2、未变更凭证或生产数据；公开探针保持原固定数据版本。

## 后续批次：内部受限访问令牌（2026-10-10）

实现：`src/lib/mcp/access-grants.ts`，仅三个内部操作：管理员 Session 签发、每请求校验、管理员撤销。没有 HTTP 入口，也没有从客户端请求角色生成身份；现有 `requireAdmin` / REST Token 认证保持不变。

- 使用 Node crypto 生成 256-bit 随机令牌，15 分钟到期；SHA-256 摘要存入独立 `mcp_access_grants` 集合，明文只从签发返回值交给未来 OAuth token adapter。该集合是授权记录，不是重复的 Card 内容集合；不存 Auth.js/Gemini/R2 凭证。
- 绑定 `AUTH_URL` 对应的精确 `/api/mcp` resource；非回环部署必须 HTTPS。资源变更、旧管理员 Token、未知/无效/过期/撤销令牌均拒绝。摘要唯一索引与 expiresAt TTL 索引由 Mongoose 建立；每次查询显式校验过期和撤销，不缓存认证、不依赖 TTL 及时删除。
- 受限 `ApiActor` 必须带授权 scopes；角色只限定权限上界，实际权限取角色与 scopes 交集。缺少 scopes 默认拒绝。工具发现按授权过滤，逐次调用仍独立检查；只读令牌无法写入，缺少 `guide.publish` 时 REST/MCP 直接创建并发布均被拒绝。`guide.update` 包括既有已发布内容的编辑，不授予撤回能力。
- 仅接受 Guide 四项批准 scopes 的子集，要求基础 `guide.read`；拒绝未知、重复、空 scopes 与用户自报 resource/lifetime/角色。internal clientId 目前只做有界格式校验，**尚未验证已注册**；未来 OAuth 授权 adapter 必须先验证 DCR 注册、精确 redirect URI、管理员同意及 PKCE/授权码，不得直接将客户端提交的 clientId 送进签发函数。
- 撤销只针对此短效令牌记录，幂等且跨连接生效；不影响其他记录，也不撤销尚未实现的长期客户端关联。撤销阻止后续认证，无法取消已认证的在途操作。当前无 refresh token，不支持后台续期或批量撤销客户端长期授权。
- 凭证不输出日志、不进入 MCP 工具或模型上下文。测试覆盖数据库只存摘要、审计不含明文；服务端模块边界测试覆盖新增授权与工具模块。默认测试仅在隔离数据库生成临时凭证，不改 `.env` 或生产数据。

### 7cc88f8 阶段验证与下一步

- `npm test`：17 个文件、182 项通过，较前次提交增加 22 项（令牌生命周期、scopes、REST 直接发布拒绝及模块边界）。
- `npm run lint`、`./scripts/build-with-test-env.sh`（执行 `npm run build` 和 TypeScript 检查）、`docker compose config`：通过。
- `npm run test:http`：隔离 MongoDB 与本地生产启动路径通过，原 Token 的发布/更新/撤回/重新发布/删除及公开页面可见性回归正常。`git diff --check`：通过。
- 官方 MCP Authorization 原文重新核对了 resource/audience 校验、无效/过期令牌 401、权限不足 403 与短效令牌建议。本批实现内部授权语义；HTTP `WWW-Authenticate` / discovery 尚未实现，不能宣称完整 OAuth 合规。
- 下一批按顺序补 DCR/客户端注册与限额、发现元数据、S256 PKCE 一次性授权码、管理员同意/撤销界面，最后接入带正确协议错误映射的业务 MCP HTTP adapter。授权码及 refresh（若增加）需单独回归并发、重放与撤销。
- 本批实现随后已提交并推送为 `7cc88f8`，真实 AGY 静态审查为 **APPROVE**，见 审查记录（见 git 历史）。该阶段没有部署或真实 Gemini/R2 调用；完整 OAuth 和 Gemini 网页/原生手机验收仍 **pending / NOT_RUN**。
- 此处测试数量记录该提交当时的结果，不作为后续工作树的固定计数；当前状态见 [接入路线图](../roadmaps/ai-client-integration.md)，后续清理与验证见 维护记录（见 git 历史）。

## 后续增量：客户端注册与限额（2026-10-10）

`src/lib/mcp/oauth-clients.ts` 与 `POST /api/oauth/register` 落实 SPEC 3.3.2 的注册子步骤，行为和剩余缺口见 [接入路线图](../roadmaps/ai-client-integration.md#历史)。该入口默认关闭，不创建内容访问令牌，也不代表管理员同意、长期授权撤销或 Gemini 握手已经完成。

注册增量直接核对 [RFC 7591](https://www.rfc-editor.org/rfc/rfc7591) 的注册默认 basic、201 响应、secret 到期时间与顶层错误结构，以及 [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) 的回调精确匹配要求。没有预设 Google 回调地址、访问客户端 metadata URL 或调用真实 Gemini/R2。历史 AGY 结论不覆盖本轮增量。

## 后续增量：本地 OAuth 授权闭环（2026-10-10）

`src/lib/mcp/oauth-authorizations.ts` 提供服务器存储、单次消费的同意意图与授权码，并通过成熟 OAuth 库完成授权/PKCE；`oauth-http.ts` 提供固定 issuer/resource 发现、精确客户端认证方法和只接受管理员 Session + 固定 Origin 的同意/撤销门禁。`access-grants.ts` 新增正式 OAuth 认证路径，逐次检查 active 客户端关联并拒绝裸内部令牌；原内部 API 和原管理员 REST Token 保留。

管理员页面沿用现有布局，名称始终标为未验证。HTML 使用 `same-origin` referrer 保留原生 POST 的 Origin，回调响应仍 `no-referrer`；不通过允许 `null` Origin 修复浏览器提交问题。新入口和正式 OAuth 验证默认关闭，该 OAuth 子批当时没有接通业务 `/api/mcp`；后续业务 HTTP 实现见路线图。

本轮直接核对 [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)、[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)、[RFC 9207](https://www.rfc-editor.org/rfc/rfc9207) 及 MCP 2025-11-25 Authorization 原文。local fake 客户端/合成 Session 的完整 HTTP 验证、并发/重放/撤销测试不替代 Google 的真实注册/授权/换码和手机验收；详见 [最新路线图](../roadmaps/ai-client-integration.md#历史)。


## 2026-10-10 独立路由迁移（已上线）

用户确认 `/api/*` 保留 REST/OAuth、正式 MCP 独立至 `/mcp`。当前精确 resource 为 `AUTH_URL` 对应的 `/mcp`，401 challenge 指向 `/.well-known/oauth-protected-resource/mcp`；旧业务及路径式元数据入口均 404。旧 resource 的意图、码、令牌拒绝，不改写历史绑定；需重新授权。此前章节和发布证据中的 `/api/mcp` 是当时路径，不是当前接入地址。本轮审查、精确镜像、上线及回滚证据见 迁移记录（见 git 历史）；真实 Gemini 双端仍未验收。
