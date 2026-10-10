# 外部 AI 客户端接入边界

状态：权限守卫、Guide 工具核心与内部短效令牌签发/校验/撤销已本地实现；生产仅部署固定数据 MCP 探针。完整 OAuth/DCR、公开受限业务身份入口和 Gemini 双端验收尚未完成。实现更新：2026-10-10；Gemini 帮助核实日期：2026-10-09。

本文件是 `SPEC.md` 3.3 / 4.5 的接入说明，不是部署、调用真实服务或变更凭证的授权。

## 已确认方向

- 保留现有 API Token 接口，新增 MCP；首先面向 Gemini 网页与手机 App，后续考虑 Codex 等客户端。
- 受限外部 AI 可读取、创建、修改及直接发布攻略，不需要在应用内额外经过管理员审批。
- 管理员及现有受信任自动化 Token 保留删除攻略的能力；后续受限 AI 身份不得删除。非敏感配置由管理员管理，敏感凭证仍来自环境变量，不能在后台展示。
- 应用内 Gemini 的 generate / revise / answer 仍只返回候选或问答，不自主执行写入。
- 复用现有 Guide schema、业务服务、revision 校验和审计，不新建 Card 集合或 Agent 框架。

## Gemini 网页／手机 App：官方能力与限制

本次直接读取 Google 官方帮助页，而非仅采用搜索摘要：

[Connect & manage custom apps for Gemini Apps — Computer](https://support.google.com/gemini/answer/17209137?co=GENIE.Platform%3DDesktop&hl=en)

该页面明确说明：

1. 可以在 Gemini 网页添加自定义应用的 MCP server URL；连接后可在网页和手机 App 使用。添加动作只在网页端进行。
2. 当前要求 18 岁以上且位于美国、个人 Google 账号、开启 Keep Activity；功能仅支持英文。工作／学校账号目前不支持。
3. MCP 服务必须遵循标准规范。原始 HTML 的连接步骤明确：不支持 Dynamic Client Registration（DCR）时才需展开高级选项填写客户端凭证；此前 readable 提取遗漏了该步骤，现已纠正。优先按 OAuth + DCR 开发，不再让用户逐屏截图推断认证。详见 [官方依据与实现决定](../decisions/2026-10-09-gemini-mcp-auth.md)。Gemini 目前要求手动确认写操作；应用允许直接发布不能绕过这个客户端确认。
4. 自定义 MCP 在 Google 的控制之外，使用者需要信任服务，并注意对话内容与其他上下文可能传给第三方应用。

这些是核实时的客户端限制，不是 Travel Cards 的产品语言变更；本应用仍使用中文。未来实施须重新检查官方页面和目标账号的实际界面，不能将地区限制、语言或写入确认视为永远不变。

**用户确认（2026-10-09）**：目标账号可以看到“添加自定义应用”入口；这是用户提供的界面可见性确认，不代表连接成功。

**仍未核实**：客户端的服务端认证握手是否兼容、目标手机 App 实际调用是否成功。仅用 Gemini API / CLI 或本地 fake MCP client 通过不能证明这些能力。

## 当前实现与权限缺口

| 入口 | 当前状态 | 与目标的差距 |
| --- | --- | --- |
| 管理员 Session | 已有 | 保留完整管理权限 |
| 受信任自动化 API Token | 已有 | 当前等价管理员，也允许 DELETE，不是受限 AI 凭证 |
| MCP | 已部署固定数据探针；五个 Guide 工具核心已本地实现 | 业务 HTTP/协议 adapter、完整 OAuth/DCR 和 Gemini 双端验收未完成 |
| 受限 AI 身份 | 本地令牌签发/资源与 scopes 校验/撤销已实现 | 无公网签发或业务入口；DCR、PKCE、管理员同意和长期客户端授权撤销待完成 |
| 非敏感配置后台 | 未实现 | 字段清单和存储方式待确定 |

现有 `src/auth.ts` / `src/lib/admin.ts` 将有效 API Token 视为管理员；`src/app/api/guides/[id]/route.ts` 的 DELETE 在认证后检查 `guide.delete`，现有 Token 仍拥有此能力。**不得直接把该 Token 交给外部 AI 来满足“不允许删除”的目标。** MCP 不列出删除工具不能解决这项权限问题，因为相同凭证仍可通过 REST 删除。

保留现有 Token 接口与引入受限 AI 能力不是同一件事。实施前明确如何区分受信任自动化与受限客户端，验证服务端拒绝删除和配置操作，再进行实际接入；本轮没有默默改变现有自动化权限。

## 最小实施顺序

1. **可用性与认证验证**：确认目标 Gemini 账号有自定义应用入口，验证远程 MCP 传输及客户端认证支持。不能假定 Gemini 可以手动填写当前 Bearer Token；按 OAuth + DCR 方向落实授权服务器与撤销，完成前不开放写入。
2. **权限边界**：建立受限 AI 身份和服务端能力检查，保留现有受信任自动化接口；以 fake transport 验证允许读取/创建/更新/发布，拒绝删除及配置修改，拒绝后数据不变。
3. **最小 MCP 接入**：只暴露已批准的 Guide 操作，复用共享业务规则。修改冲突返回既有 409，不自动重试覆盖。未知能力（撤回、图片上传等）不因现有管理员 API 支持就自动开放给 AI。
4. **Gemini 双端验收**：网页连接、手机调用、直接发布、权限拒绝、冲突及来源展示均有真实证据；客户端要求的手动确认如实记录。
5. **非敏感配置管理**：确定字段后增加管理员专属界面与服务端校验；不提供凭证展示或修改入口。

## 发布门槛与开放决定

- 权限隔离、可撤销客户端授权、输入验证、日志脱敏、revision 冲突处理缺一不可。
- 外部 AI 提供来源 URL 不能自动标记为 Gemini grounding 已验证；沿用现有来源结构，明确来源证据。
- 未实现权限隔离前，MCP 开放写入为 blocked；未具备 Gemini 账号条件时，该客户端验收为 blocked，而非应用集成成功。
- 配置字段清单、授权服务器具体实现、外部 AI 撤回/上传权限仍是待决定项。
- 权限基础、Guide 工具核心和短效令牌底座仅本地实现；生产仅部署固定数据探针。未新增第三方依赖，未开放真实业务客户端或配置后台。

## 第一批：权限基础（2026-10-09）

### 已实现范围

- `src/lib/capabilities.ts` 定义显式能力白名单；未知能力、未知身份默认拒绝（403）。受限 AI 仅允许 Guide 读取、创建（含直接发布）、更新、发布；删除、撤回、上传及调用应用内助手均拒绝。
- `src/auth.ts` 的 `requireCapability` 接入现有管理 REST 入口，在读取写请求体和调用业务服务前检查能力。管理员 Session 和受信任 Token 原有能力不变，同源检查、revision 冲突与审计沿用现有流程。
- `config.manage` 仅为保守的策略占位：只允许管理员 Session，拒绝受限 AI 和自动化 Token。尚无配置存储或路由，不能据此声称配置后台已受端到端保护；未来配置入口必须使用该检查。
- `tests/capabilities.test.ts` 覆盖权限矩阵及默认拒绝；`tests/capability-routes.test.ts` 注入 fake 身份，使用真实 Route Handler、能力守卫、Guide 服务和隔离 MongoDB，覆盖允许操作、直接发布完整性、409、禁止操作后数据不变和原 Session/Token 删除能力。Gemini/R2 使用 fake transport，不调用真实服务。

### 本批验证结果

- `npm test`：14 个测试文件、103 项测试通过（包括 fake 身份权限集成测试）。
- `npm run lint`：通过。
- `./scripts/build-with-test-env.sh`：以隔离测试环境执行 `npm run build`，构建与 TypeScript 检查通过。
- `docker compose config`：通过，未输出包含环境配置的渲染结果。
- `npm run test:http`：临时 MongoDB 与本地生产构建启动路径通过，覆盖发布、更新、撤回、重新发布、删除及公开页面 no-store 可见性。
- `git diff --check`：通过。真实 Gemini/R2 调用、Gemini 网页/手机验收和生产部署均 **NOT_RUN**。

### 仍然阻塞 / 下一步

1. 按官方原文确认的 OAuth + DCR 路径推进开发，不再以用户逐屏截图为前置条件；具体方案和已实现的 Guide 工具核心见 [认证决定](../decisions/2026-10-09-gemini-mcp-auth.md)。
2. `requireCapability` 仍只解析原有管理员身份；后续批次已增加内部短效受限令牌校验（见文末），但未接入公网请求，亦无真实客户端注册/授权流程。不能将内部签发函数或 fake 同意当作完整 OAuth；现有 Token 不能充当替代品。
3. 增加 MCP 时复用该能力策略和 Guide 服务，再验证真实凭证经 REST/MCP 的禁止操作与撤销；当前 fake 身份测试不代表真实客户端认证通过。
4. 网页／手机双端验收、业务 MCP 开放写入与配置后台继续为 **blocked / pending**。权限基础未部署；后续获授权单独部署的固定数据探针见下节。

## 公开连接探针：已部署（2026-10-09）

用户在确认手机网页版仅有 URL 输入框后，明确允许在现有域名部署仅返回固定信息的最小联调入口。该授权不扩展到业务写入、凭证变更或其他项目。

- **URL**：`https://travel.keyi.win/api/mcp-probe`
- **唯一工具**：`connection_check`，无参数，返回固定英文测试信息；不读取攻略、配置或凭证，无外部请求，无业务依赖导入。公开无认证是这个合成探针的设计，不是未来业务 MCP 的认证方案。
- **实现**：`src/app/api/mcp-probe/route.ts`；无新增依赖。Streamable HTTP 使用直接 JSON 响应，支持协议版本 2025-11-25、2025-06-18、2025-03-26；通知返回 202，GET/SSE 和 DELETE 返回 405。实际请求体限制 8 KiB，非法 Origin/协议/格式拒绝；有 Origin 时仅允许当前部署域名，不提供跨站浏览器 CORS。
- **官方依据**：[Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)，本轮直接读取。最小探针不是完整 MCP 服务实现，不提供业务资源、会话、OAuth 或旧 SSE 传输。

### 验证与部署证据

- `tests/mcp-probe.test.ts`：35 项通过；全量 `npm test`：15 个文件、138 项通过。最初临时构建源码放在仓库 `tmp/` 被 Vitest 重复收集；移至项目专属 `/tmp/` 目录后重跑通过，未用测试排除规则掩盖失败。
- lint、测试环境生产构建、Compose 配置检查通过。生产候选镜像在禁用网络、无应用凭证、只读文件系统的临时容器中完成真实 HTTP initialize / initialized / tools/list / tools/call / 非法工具与 Origin 拒绝验证。
- `node scripts/mcp-probe-smoke.mjs https://travel.keyi.win/api/mcp-probe`：部署后公网通过。此脚本仅调用固定测试工具，不携带凭证。
- 源码基线：`c912c47` 加**仅一个** `src/app/api/mcp-probe/route.ts`；构建前逐文件 Git blob hash 比较，确认无其他源码变更。工作区权限基础、文档和用户截图均未夹带部署。
- 当前镜像：`travel-cards-mcp-probe:20261009-6r4x61`，image ID `sha256:ef83a91ca50f3f7c5a7fe0e1ab84f638ee1452d726e7aed61914c326aa3513d2`。
- 部署仅替换 Travel Cards Web；共享 Nginx/MongoDB 未重启，未操作生产攻略。替换前后环境变量逐项一致；比较中发现的哈希表象差异已确认仅为 Compose 对 `$` 的转义，非凭证漂移。凭证只在部署进程内存中传递，未写入发布产物或输出。
- 上线后 `/`、`/api/health/live`、`/api/health/ready` 正常。未执行生产 CRUD、真实 Gemini/R2 调用或管理员登录测试。

### 下一步与回滚

用户已要求按官方文档开发，不再逐屏截图试错。探针保留为纯传输诊断，不作为开发前置门槛；OAuth/DCR 与业务协议实现后，才请用户完成最终账号授权和网页/原生手机 App 验收。不得用管理员 Token 绕过认证，探针连通不等于认证通过。

本地发布产物（未提交）：`tmp/mcp-probe-20261009-6R4X61/`，含构建日志、基线源码归档及保留运行环境的部署/回滚 helper。回滚镜像保留为 `travel-cards-web:before-mcp-probe-20261009-6r4x61`。得到回滚/下线授权后执行：

```bash
python3 tmp/mcp-probe-20261009-6R4X61/deploy-preserving-env.py --rollback
```

该 helper 验证当前/目标镜像并只在内存保留原运行环境，不打印配置；回滚后需检查首页与 live/ready，并确认探针不再可用。**未执行回滚**。正常 `deploy.sh`/Compose 重新构建将改变当前探针部署状态；后续正式发布前须明确纳入或移除该临时入口。

## 本地批次：官方文档与 Guide 工具核心（2026-10-09）

详见 [认证决定与验证记录](../decisions/2026-10-09-gemini-mcp-auth.md)。新增 `src/lib/mcp/guide-tools.ts`，复用共享 schema、业务服务、能力检查及审计，提供 list/get/create/update/publish 五个工具。16 项专项测试通过；全量 154 项测试、lint、生产构建/类型检查、Compose 配置检查通过。本批未部署，不改变公开探针；真实 OAuth/DCR、撤销和业务协议 adapter 仍待实现。

## 最新本地批次：短效受限令牌与 scopes（2026-10-10）

- 新增 `src/lib/mcp/access-grants.ts`：256-bit 随机访问令牌、15 分钟到期、数据库只存摘要、精确 MCP resource 绑定、逐请求查询过期/撤销及幂等撤销。签发/撤销仅供未来已验证的管理员同意流程调用，没有公网接口。
- 受限身份必须携带授权 scopes；工具发现和执行均按实际授权收窄。只读授权拒绝写入，创建权限不隐含直接发布权限，管理员及既有 Token 行为不变。
- `npm test`：17 个文件、182 项通过；lint、隔离环境生产构建/类型检查和 Compose 配置检查通过。验证使用 fake 管理员同意与隔离 MongoDB，不调用 Gemini/R2。
- 当前只实现短效访问令牌的本地生命周期；DCR 注册、OAuth discovery、S256 PKCE 一次性码、管理员同意/长期授权撤销界面和业务 MCP HTTP 仍 **pending**。尚无 refresh，需重新授权；内部记录的撤销不代表已支持 Google 账号解除关联。
- 不部署、不变更生产凭证或数据库、不提交/推送；公网仍为此前独立固定数据探针。
