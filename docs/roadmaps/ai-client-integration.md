# 外部 AI / MCP 接入路线图

实现与运行状态对齐：2026-10-23。Gemini 官方帮助最近核实：2026-10-09（本次未重新核实）。

本文件维护当前状态与下一步，不作为部署、凭证变更、真实服务调用或外部写入的授权。产品与权限契约以 `SPEC.md` 3.3 为准；认证细节与历史本地验证见 [认证决定](../decisions/2026-10-09-gemini-mcp-auth.md)。

**当前协议状态**：正式 `/mcp` 同时支持 2026-07-28 与标准 MCP 握手，已于 2026-10-23 随 `0dfe091` 固定镜像部署，运行 revision 与源码 SHA 已核对，见[本次发布记录](../deployments/2026-10-23-review-fixes.md)。下方历史上线与 2026-10-12 Gemini 用户验收不覆盖新版本，真实客户端尚未重新验收；兼容性、错误码和本地验证见[协议决定及补充](../decisions/2026-10-21-mcp-2026-migration.md)。

## 产品边界

- 保留管理员 Session 和既有受信任自动化 Token 的完整原有能力，包括删除；现有 Token 不是受限 AI 凭证。
- 受限外部 AI 可读取、创建、修改和直接发布同一份 Guide，不额外要求应用内逐篇审批。仍遵守客户端写入确认、完整性校验、slug 约束、revision 冲突和审计。
- 受限 AI 不得删除或管理配置；撤回仍默认拒绝；图片上传已获批准，需 image.upload，直接替换封面还需 guide.update 与 expectedRevision。应用内 Gemini 仍只生成候选或问答，不自主写库。
- 外部来源 URL 仅为客户端提供的引用，不能自动标记为 Gemini grounding 已验证。不新建重复 Card 内容模型或 Agent 框架。

## 仓库实现与验收状态

| 能力 | 已实现 | 验收状态或剩余边界 |
| --- | --- | --- |
| 管理 API 权限 | 显式能力检查；原 Session/Token 兼容性回归 | 受限凭证未接入管理员 REST；不能把既有 Token 给 AI |
| Guide MCP 工具核心 | 六个工具不变；HTTP 双协议分流，共享鉴权、限流与 revision 保护 | `0dfe091` 固定镜像隔离验证及生产公开 smoke 通过；真实 Gemini 兼容性待验 |
| 受限访问令牌 | OAuth 授权码衔接、100 × 365 天长效摘要令牌、精确 resource/scopes、逐次 active 客户端检查和持久化撤销；业务 HTTP 仅调用正式校验、拒绝裸内部令牌 | 双端验收已完成（用户确认）；专项过期/撤销实测未单独确认 |
| OAuth/DCR | 注册/限额、标准发现、S256 PKCE、一次性码、管理员同意与客户端列表/撤销；生产已启用，新环境默认关闭 | 真实 Gemini 网页/手机双端验收已完成（用户确认） |
| 连接探针 | `/api/mcp-probe` 固定数据工具及公开部署记录 | 不提供认证或业务能力，不替代 Gemini 双端验收 |
| 非敏感配置后台 | 管理员专属能力策略 | 字段清单、存储与管理界面 |

`restricted-ai` 的有效权限为角色上界与实际 scopes 的交集。缺少 scopes 默认拒绝；发现工具时过滤并不替代调用时鉴权。当前令牌仅绑定 `AUTH_URL` 对应的 `/mcp`（本轮从旧 `/api/mcp` 迁移，需重新授权）；每次认证查询过期/撤销状态，不依赖 TTL 及时删除。内部撤销针对令牌记录；新客户端撤销统一阻止其令牌、授权码和未确认意图的后续使用，但不能取消已认证的在途操作，也不代表真实 Google 账号关联已验收。当前没有 refresh token。

内部底座已提交至 `7cc88f8`；该提交获得真实 AGY 的 **APPROVE**，证据见 [审查记录](../reviews/agy-7cc88f8/closeout.md)。后续 DCR/OAuth 增量不在该历史审查范围内；本轮另获扩展审查并已部署，仍不能将历史审查当作 OAuth 接入通过。

## 真实双端验收（用户确认）

- 2026-10-12，用户确认 travel-cards 当时协议的真实 Gemini 网页/手机双端验收已完成；该历史批次不再标为 pending / NOT_RUN。本次 2026-07-28 协议迁移需要独立真实客户端验收。
- 依据为用户验收结论，不是本轮助手执行的实测。本次未补采截图、日志、客户端版本或逐项测试结果，不推定实际验收日期、所用账号条件或部署版本。
- 此确认不自动覆盖图片上传、冲突、撤销、写入确认等每个专项测试，也不等同图片上传安全复核通过；未提供的专项证据不补写为已通过。非敏感配置后台仍未实现。
- 历史部署、审查及下方阶段记录中的 NOT_RUN / pending 保留当时语义，不代表当前双端状态；也不将本次确认追溯为当时已经验收。
- 可作为后续 Meemo MCP + OAuth 接入方案的已验收参考；Meemo 自身的用户隔离、权限、授权及真实客户端验收仍须独立完成。

## Gemini 官方能力与约束

官方依据：[Connect & manage custom apps for Gemini Apps](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en)。最近核实的原文说明：

1. 网页添加 MCP server URL，连接后可在网页和手机 App 使用；添加操作只在网页端。
2. 当时要求美国地区、18 岁以上、个人 Google 账号、开启 Keep Activity；仅支持英文，不支持工作/学校账号。
3. 原始 HTML 的连接步骤明确：不支持 Dynamic Client Registration（DCR）时才需展开高级选项填写客户端凭证。此前 readable 提取遗漏了此步骤，现已纠正。
4. MCP 必须符合标准；Gemini 要求手动确认写操作。应用的直接发布能力不得绕过该确认。
5. Gemini 可能把对话及其他上下文传给第三方应用，管理员应理解并监督其访问范围。

此前用户确认添加入口可见，截图中的高级选项显示 OAuth Client ID / Client secret；该截图本身不是认证握手或连接成功证据。后续用户已确认真实双端验收完成，见上方验收状态记录。 按官方原文和 [MCP Authorization 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) 开发，不再以逐屏截图为前置条件；不得用 Gemini API/CLI 或 Enterprise 文档代替 Gemini Apps 的验收契约。地区及功能限制在真实验收时需重新核实。

## 当前发布与下一步

当前发布为 `0dfe091`，固定镜像的 revision 与源码归档 SHA 已核对一致，实际镜像隔离测试与公网检查通过，详见[本次发布记录](../deployments/2026-10-23-review-fixes.md)；历史审查不改写。六个工具与五项 scopes 已实现；客户端注册及令牌均为 100 × 365 天有限有效期，旧记录不自动扩权/延寿。历史 Gemini 网页/手机双端验收已由用户确认完成，已部署的双协议兼容仍需真实客户端重新验收。

推进顺序：图片 URL 网络边界、编辑内容保护和搜索反馈修复已提交并部署，源码溯源缺口已闭合。下一步由用户验收 Gemini 网页/手机的授权、制作、发布、图片、冲突与撤销，记录真实客户端结果。非敏感配置后台继续等待具体字段与实际使用需求，不作为完成攻略流程的前置条件。

2026-10-23 修复：URL 图片拉取逐跳校验全部 DNS 地址，拒绝私有/保留及 IPv6 映射/隧道地址，通过自定义 DNS lookup 固定 TLS 连接地址并保留原主机证书校验；最多 5 跳共用 15 秒期限，提前关闭拒绝的响应并限制实际流量 10 MiB。下载、超时、重定向和上传前权限使用 fake transport 回归，不代表真实 R2/Gemini 上传已验收。Base64 仍须满足 MCP JSON 总请求体 2 MiB 限制，原始图片实际小于 1.5 MiB；本轮不放宽该边界。

以下各节（含历史实施顺序与末段总结）保留历史阶段快照；其中 15 分钟、30 天、五个工具、默认关闭及 NOT_RUN / pending 均描述当时批次，不代表当前状态。

## 历史：公开探针与生产版本

- 联调 URL：`https://travel.keyi.win/api/mcp-probe`。唯一工具 `connection_check` 无参数，只返回固定非敏感信息，无数据库/应用凭证/外部服务依赖。
- 实现是无状态 Streamable HTTP 的直接 JSON 响应；不提供 SSE 长连接、OAuth、业务资源或写工具。公开无认证仅适用于此合成探针，不是业务 MCP 的认证方案。
- 2026-10-09 按授权从 `c912c47` 加单个探针路由构建部署，曾完成公网协议 smoke。历史镜像、临时构建及回滚记录保留在 Git 中当日版本，不当作当前生产事实。
- 2026-10-10 只读核对：当前容器使用 `travel-cards-web`，image ID `sha256:3db6a4206c751c927ed250a6c19971fe32ae91b244347fe1d1e591f0d58dcfdd`；首页 GET 为 200，探针 GET 为预期的 405。镜像未提供源提交标签，**不能据此确认线上对应哪个 Git 提交或哪些内部模块已部署**。
- 原探针回滚标签 `travel-cards-web:before-mcp-probe-20261009-6r4x61` 已不存在，旧临时 helper 也不适配当前镜像。已移除过时操作指令和临时产物；回滚前需重新明确目标镜像/提交及配置，获得授权后执行，不能照抄旧命令。

## 历史：DCR 注册增量（2026-10-10）

以下记录注册子步骤当时的范围与验证；后续 OAuth 闭环见下一节，现状以顶部能力表为准。

- `POST /api/oauth/register` 仅在 `MCP_OAUTH_ENABLED=true` 时可用，默认 404，关闭时不读 body 或连接数据库。生产开关未改动。
- 输入最多实际 16 KiB；1～10 个 HTTPS 回调地址，每个最多 2048 字符，禁止 userinfo、fragment、空白、反斜杠与通配符；保存原始字符串，后续授权/换码仍须做精确匹配。可选名称最多 128 字符，仅是未验证标签。未知元数据按 RFC 7591 忽略，不存储、不请求外部 URL。
- 仅注册授权码/code 模式，支持 `none`、`client_secret_basic`、`client_secret_post`，缺省 basic；批准 scopes 取 `guide.read/create/update/publish` 子集，必须含 read，未指定时仅 read。注册得到的 scope 是申请上界，不是管理员同意。
- 随机 client ID/secret；secret 仅创建响应返回一次，数据库仅存摘要。`mcp_oauth_clients` 到期 30 天，TTL 清理加查询时显式到期/撤销检查。无客户端自助读取 secret 或注册管理接口。
- MongoDB 原子计数限制全局每个固定时钟小时 100 次尝试，包括非法输入；超限 429 与 `Retry-After`。计数窗口有 TTL，不能靠伪造代理/IP 头绕过。该全局配额可能被匿名请求耗尽，此时只阻止新注册，不授予攻击者权限。
- 返回标准 DCR 顶层成功/错误结构，响应不缓存，失败不回显内部错误或 secret。隔离测试入口：`npm test -- tests/mcp-oauth-clients.test.ts tests/boundary.test.ts`。
- **仍未完成**：发现、管理员同意、PKCE/换码、长期授权撤销、业务 MCP。没有新增内容凭证签发入口；注册结果不能用于调用 Guide 工具，也不能交给 Gemini 当作已完成接入。

本轮本地验证：`npm test` 18 个文件、216 项通过；DCR 与模块边界定向测试 45 项通过；lint、TypeScript、`scripts/build-with-test-env.sh`（执行 `npm run build`）、`docker compose config` 通过。`npm run test:http` 在隔离 MongoDB/本地 production server 验证原管理员 Token 的发布、修改、撤回、再发布、删除及 HTML/RSC 可见性；DCR 使用直接 Route Handler + 真实隔离 MongoDB 的 fake 客户端测试，不是 Gemini 实际握手。生产部署、AGY 新审查及 Gemini 双端验收均 **NOT_RUN**。

## 历史：本地 OAuth 授权闭环（2026-10-10）

- `/.well-known/oauth-authorization-server` 与 `/.well-known/oauth-protected-resource`（含 `/api/mcp` 路径式元数据）：issuer/endpoints/resource 只来自服务器 `AUTH_URL`，不使用请求 Host；仅声明授权码、S256 和三种已批准客户端认证方法。
- `GET /api/oauth/authorize` 要求精确注册回调、state、S256 challenge、规范 resource 及注册 scopes 的子集。未登录只跳转到本站登录页，不创建意图；登录后仍须在 `/admin/oauth/consent` 明确确认，每次连接都不自动批准。
- `POST /api/oauth/consent` 只接受服务器存储的意图 ID 与同意/拒绝决定；意图绑定管理员身份，5 分钟、单次原子消费。使用已安装 `@node-oauth/oauth2-server` 完成授权码及 PKCE 流程，授权码同样最多 5 分钟、仅存摘要，回调带原 state 与固定 issuer。
- `POST /api/oauth/token` 有界表单、拒绝重复/未知字段、按注册方法精确验证 client secret；资源、客户端、回调、PKCE 与授权码逐项绑定。并发换码最多一次成功，错误 PKCE/回调会烧掉该码。只返回共享底座的 15 分钟受限令牌，不提供 refresh 或后台续期。
- `/admin/oauth` 只显示已经明确授权的客户端，提供 `POST /api/oauth/revoke-client`。撤销持久化于客户端根状态，每次读取意图、换码及正式令牌认证都复查；注册/授权仍最多 30 天，TTL 不延长权限。已撤销客户端必须重新注册并获得同意。
- 同意/撤销必须是管理员 Session + 固定 Origin，旧管理员 Token、缺失/`null` Origin 和伪造 Host 不可豁免。HTML 管理页使用 `same-origin` referrer 以保留原生 POST 的 Origin；外部回调响应仍 `no-referrer`。浏览器中过期/重复确认返回可恢复的失效页，不重放授权。
- 所有新入口默认关闭；正式认证函数 `authenticateMcpOAuthAccessToken` 也受开关控制，拒绝 Cookie、管理员 Token、裸内部令牌与失效客户端关联。原管理员 REST 不接受 OAuth 令牌，原 Token CRUD/发布/删除保持兼容。
- **该 OAuth 子批当时未完成**：业务 `/api/mcp`、401 discovery challenge、工具协议/业务错误映射、扩展 AGY 审查，生产开关保持关闭。上述服务端项已在下一业务批补齐并上线；真实 Gemini 账号及双端验证仍未完成，发现/换码成功不代表真实客户端成功。

验证入口：`npm test`、`npm run lint`、`scripts/build-with-test-env.sh`、`docker compose config`、`npm run test:oauth`。本轮 19 个文件、255 项测试通过；lint、类型检查、构建、Compose 通过。HTTP smoke 使用隔离 MongoDB和仅本地有效的合成 Auth.js Session，三种认证方法、PKCE、回放/撤销、原 Token CRUD/发布/删除及 OAuth REST 拒绝均通过，不调用 Gemini/R2，不跟随外部回调。

浏览器视觉检查覆盖 1440×1000 与 390×844、明暗主题及 reduced-motion；手机视口撤销按钮修复后高度 50px、无横向溢出。原生同意、拒绝、已消费意图恢复和撤销功能通过；实际 POST Origin 等于固定服务地址，回调响应 `no-referrer`，键盘焦点轮廓为 3px。功能检查在本地拦截回调响应，不访问真实外部应用。真实设备、读屏、Gemini 双端、扩展 AGY 审查和部署均 **NOT_RUN**；历史 AGY 结论不覆盖本轮。

## 历史：业务 MCP 首次上线批次（2026-10-10）

`POST /mcp` 提供无状态 Streamable HTTP 的 JSON 响应，支持三版协议协商、初始化/通知/ping 和五个攻略工具。GET/DELETE 不建立 SSE/session，有效身份得到 405；无身份返回 401 discovery challenge。提供 Origin 时只接受固定服务端同源；不依赖请求 Host，不接受管理员 Cookie、旧 API Token 或裸内部令牌。

401 challenge 声明四项攻略 scopes，供首个客户端明确申请完整维护权限；已发只读令牌仍只发现两个读工具。403 step-up 列出调用所需最小 scopes（包含 read；创建并直接发布还含 publish）。未知方法/工具使用 JSON-RPC 错误；业务/校验错误返回 `isError: true`，结构中保留 409 与 REVISION_CONFLICT。JSON 请求上限 2 MiB，无 id 的工具调用禁止执行，冲突/失败不自动重试。探针保持固定数据，未增加删除、撤回、上传或配置工具。

上线使用无凭证的隔离源码快照、真实 AGY 只读审查、带源码 SHA-256 标签的不可变 Docker 镜像和该镜像的隔离 HTTP 验证。`docker-compose.production.yml` 必须显式选定镜像，默认不启用 MCP。部署只替换 Web；旧镜像和原开关状态作为回滚目标，生产 smoke 只做公开/未授权只读检查，不签发临时生产凭证或修改攻略。本轮服务端已通过门禁部署并显式启用，见[发布及回滚记录](../deployments/2026-10-10-oauth-mcp.md)；真实 Gemini 双端验收仍 NOT_RUN。

## 历史：路由迁移（2026-10-10 用户确认）

REST 保留 `/api/*`，正式 MCP 迁至 `/mcp`，路径式元数据迁至 `/.well-known/oauth-protected-resource/mcp`；根资源元数据保持可用，OAuth endpoints 不变。旧 `/api/mcp` 与旧路径式元数据返回 404，不建立跳转/别名，也不改写旧授权记录的 resource。旧意图、码、令牌拒绝；客户端重新授权。历史源清单、审查和发布记录仍保留当时的旧路径。本轮已通过真实 AGY 审查和精确镜像回归并上线，见[迁移发布记录](../deployments/2026-10-10-mcp-route.md)；真实 Gemini 网页/手机验收仍 NOT_RUN。

## 历史：实施顺序与验收

1. **业务 MCP HTTP**：复用五个工具及能力策略，正确区分协议错误和 `isError: true` 业务错误，保留 `REVISION_CONFLICT` 信息，不自动重试覆盖。以 fake 客户端验证 REST/MCP 绕过、重放、并发及撤销后的拒绝。
2. **扩展审查与部署/Gemini 双端验收**：权限、输入、脱敏日志及授权撤销全部通过后，另行授权部署。由用户完成必要的账号授权；网页/原生手机调用、发布确认、冲突和来源展示均保留真实证据。
3. **非敏感配置管理**：字段确认后增加管理员专属界面及服务端检查，不展示或修改环境凭证。

默认测试使用隔离 MongoDB 和 fake 身份/transport，不依赖真实 Gemini/R2。本地 OAuth 与业务 MCP 已完成上述闭环；扩展审查与服务端上线门禁已通过；真实双端验收仍 **pending**；生产仅允许管理员明确 OAuth 同意的受限身份按 scopes 写入，不将真实账号验收标为通过。
