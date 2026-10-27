# Travel Cards

供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台，公开展示与分享同一份结构化攻略。

**当前实现**：管理员可编辑、发布、删除攻略、上传 R2 封面及 GPX/KML/PDF 路线与资料附件；公开详情页提供逐日行程与附件安全下载；应用内 Gemini + Google Search 只生成待采纳候选，通过普通保存流程持久化。现有受信任自动化 API Token 接口继续可用。

**MCP 双协议支持（2026-07-28 与标准 MCP 兼容模式）**：受限外部 AI 仍可创建、修改及直接发布，但不得删除或管理配置。七个工具（含 `upload_image` 与 `upload_attachment`）、长效令牌及 OAuth/DCR/PKCE 落实；双协议兼容已随 `0dfe091` 于 2026-10-23 通过固定镜像隔离测试并部署，真实 Gemini 双端用户验收仍待重新验证。非敏感配置后台仍待完成，服务密钥仍来自环境变量；既有管理员 Token 不能交给受限 AI。

## 当前状态

- Next.js 16、Auth.js、MongoDB、攻略 CRUD/发布/撤回、R2 上传和 Gemini 候选助手已实现。
- MCP 提供 list/get/create/update/publish 五个攻略工具、`upload_image` 及 `upload_attachment`。独立 `image.upload` / `attachment.upload` scope 控制上传；直接替换封面或追加附件还需 `guide.update` 和 expectedRevision，禁止删除、撤回及配置管理。
- 正式 `/mcp` 已部署双协议：现代 2026 协议（`server/discover`、逐请求 `_meta` 与 HTTP 头绑定、`resultType: complete`）及标准 MCP 兼容模式（`initialize`、`notifications/*`、`ping`）。历史双协议镜像已通过隔离 HTTP/OAuth 测试；每个受限令牌的工具调用上限为 120 次/分钟，超限返回 429 / Retry-After。见[协议与补充说明](./docs/decisions/2026-10-21-mcp-2026-migration.md)。
- OAuth/DCR/PKCE、管理员同意/撤销已实现。新环境默认关闭，当前生产显式启用。令牌与客户端注册默认 100 × 365 天有效，并非永不过期；无 refresh token。旧注册与令牌不自动扩权或续期，需要重新注册授权。
- 2026-10-27 北京时间 09:51 已发布 `feb9d02768402e1fe16d3719d076b296d2836240`：包含行程日期、MCP 错误 CORS、发布回滚修复及安全依赖升级。运行镜像 `sha256:918dcc4c9a8c2565d2eff44875159de97458a255f256029da16c5ed60a60936d`，revision 与源码归档 SHA 匹配；[发布、验证与回滚记录](./docs/deployments/2026-10-27-maintenance-release.md)。
- `0dfe091` 的图片下载、编辑保护及搜索反馈修复已包含在当前版本；该批的镜像隔离 HTTP/OAuth 测试、25 项公网检查和回滚信息保留在[历史发布记录](./docs/deployments/2026-10-23-review-fixes.md)。历史测试不自动覆盖后续提交；当前检查范围见下方记录。
- 历史协议的真实 Gemini 网页/手机双端验收已完成，依据为 2026-10-12 用户确认，见[验收状态记录](./docs/roadmaps/ai-client-integration.md#真实双端验收用户确认)。2026 协议的真实客户端兼容性待重新验收；图片上传专项未单独确认，非敏感配置后台尚未实现。
- 历史核心实现与内部令牌审查分别见[核心审查](./docs/reviews/agy-final-implementation/closeout.md)、[7cc88f8 审查](./docs/reviews/agy-7cc88f8/closeout.md)；历史 APPROVE 仅覆盖当时范围。
- 当前开发目录：`/home/lin/travel-cards`
- 权威需求与权限契约：[SPEC.md](./SPEC.md)
- 已确认产品定位：[PRODUCT.md](./PRODUCT.md)
- 项目约束：[AGENTS.md](./AGENTS.md)
- 目录与文档导航：[docs/README.md](./docs/README.md)
- 现有 UI 与 Impeccable 工作流：[docs/frontend.md](./docs/frontend.md)
- 外部 AI / MCP 接入边界与 Gemini 官方限制：[docs/roadmaps/ai-client-integration.md](./docs/roadmaps/ai-client-integration.md)
- UI 精修及 AGY 复审：[docs/reviews/ui-impeccable-review.md](./docs/reviews/ui-impeccable-review.md)

Gemini 自定义 MCP 应用目前有地区、年龄、账号和语言限制，并要求客户端确认写操作；网页连接后才可在手机 App 使用。本项目历史协议的双端接入已由用户确认验收完成；该结果不代表所有账号、地区或本次 2026 协议均可用，详见接入文档。

Impeccable 已初始化 `PRODUCT.md`，用户选择的新页面构建默认是代码优先，保存在 `.impeccable/config.json`。开发期 live setup 已记录，但未注入或启动；本轮未重做视觉系统。

## 运行核对与推进建议（2026-10-27）

审查、文档对齐、修复和上线均已完成。当前版本为 `feb9d02`；仅更新 Web，共用 MongoDB/Nginx 未重启，凭证、OAuth 开关、端口、网络别名和日志轮转保持。六篇公开攻略的响应内容在切换前后完全一致。目录职责与清理边界见 [docs/README](./docs/README.md)。

本次上线包含：

1. 编辑器按实际日期保留稀疏/乱序行程；缩短已填写行程先确认，取消和未修改失焦保留内容。
2. 两种 MCP 协议的工具错误响应补齐允许来源 CORS，可读取授权挑战与 `Retry-After`。
3. 发布脚本验证 Git revision/归档 SHA、固定镜像 ID，失败恢复原运行配置并核验健康；修复 Docker 空 IPAM 对象误拒绝。
4. 恢复 `test:oauth` 和 `test:recovery`，覆盖隔离协议闭环及合成数据恢复。
5. Next.js / eslint-config-next 16.4.3、Zod 4.6.7、Vitest 4.1.12（Vite 8.3.5）；本次 `npm audit` 已知漏洞 0。

| 检查 | 结果与边界 |
| --- | --- |
| `npm test` | 24 个文件、325 项通过，含 12 项 fake 发布/回滚回归 |
| lint、typecheck、默认 `npm run build`、Dockerfile 构建、Compose | 通过；此前主机 Turbopack EPERM 本次未复现 |
| 正式固定镜像 `test:oauth` | REST、双协议、PKCE、三种认证、权限/409/撤销/CORS、数据库故障恢复通过；合成账号与独立 MongoDB |
| `test:recovery` | 合成攻略、索引、图片、校验和、损坏检测及 sentinel 不变通过 |
| 正式镜像隔离浏览器 | 登录拒绝/成功、稀疏行程调整、保存重载、退出保护；390/1440px 编辑器与公开页无溢出 |
| 上线后 | 源站/公网各 28 项检查通过；新容器健康，无重启/OOM，初次日志汇总无错误/警告 |

发布前日志窗口（UTC 10-23 00:04 至 10-26 18:29）共 460 请求，无 5xx、4 次 499，多数 404 为探测路径。此前容器有授权/换码/受限更新成功，也有一次不完整行程参数拒绝；这些均不等于完整客户端验收或容量证据。

公网浏览器出现过一次详情文档 503（server=cloudflare）及 CSP 提示，随后源站/公网直接导航均 200、页面可用，源站观察窗口无 5xx；原因未确认，未修改边缘策略。完整来源清单、检查结果、旧镜像与观察项见[本次发布记录](./docs/deployments/2026-10-27-maintenance-release.md)。

下一步由用户完成当前版本 Gemini 网页/手机的授权、读取、完整行程修改、发布确认、图片、409 与撤销专项，并观察正常使用是否重现瞬时 503。针对历史不完整行程参数，应按工具 schema 重新提交，不放宽服务端校验。配置后台等具体字段需求；现有证据不支持扩容或新增 Agent 框架。

## 性能优化发布（2026-10-23）

- 新上传图片返回原图及 `variants` 元数据；保存封面时应保留完整返回值。公开卡片与详情使用响应式 WebP，旧图片继续使用原图；未批量重写历史图片。上传最多 4000 万像素，原图仍限 10 MiB，MCP JSON 包络仍限 2 MiB。
- 带 `q` 的首页在服务端返回搜索结果，初始化不再重复请求；清空恢复列表，失败仍可重试。
- MCP 鉴权将令牌与有效客户端检查合并为一次有索引的数据库查询；撤销、到期、权限和限流语义保持。
- `list_guides` 可选 `limit: 1..100`，默认 100，`hasMore` 提示还有匹配项，可用 `q` 缩小范围。写工具可选 `responseMode: "summary"`，省略仍返回完整攻略；摘要包含当前 revision，可直接用于下一次显式修改。创建并发布使用 `publish: true`；上传并替换封面使用 `guideId` + `expectedRevision`。客户端需重新发现工具才能看到新参数说明。

本轮优化已随固定镜像发布（包含 25 个测试文件、318 项测试全过与 AGY 审查 APPROVE，详见[审查记录](./docs/reviews/2026-10-23-performance-agy.md)）；公开页面验证及测量边界见[前端记录](./docs/frontend.md)。

## 本地配置

```bash
cp .env.example .env.local
printf '%s' '你的管理员密码' | node scripts/hash-admin-password.mjs
```

将输出的 `scrypt$...` 写入 `.env.local` 的 `ADMIN_PASSWORD_HASH`，并填写：

- `AUTH_URL`：默认 `http://localhost:3100`
- `AUTH_SECRET`：至少 32 个字符
- `ADMIN_EMAIL`
- `HERMES_API_TOKEN`：Hermes 等外部流程调用 API 的 Bearer Token（至少 16 字符，可选；兼容读取旧变量名 `API_TOKEN`）
- `MCP_OAUTH_ENABLED`：默认关闭；控制本地 OAuth 发现/注册/授权/换码及管理员同意/撤销页面。当前生产已显式启用；新环境启用与部署仍需授权，开启不代表 Gemini 已接入
- `MCP_ALLOWED_ORIGINS`：可选、逗号分隔的额外精确 Origin；默认已允许 `AUTH_URL` 同源与 `https://gemini.google.com`。不使用通配符；此配置不授予 OAuth 权限，管理员同意/撤销仍须本站同源
- `MONGODB_URI`（Compose 使用 Meemo 共用的 `mongodb` 服务）
- R2 与 Gemini 变量；未配置时只有对应操作不可用，已有攻略浏览不受影响

不要把 `.env.local` 提交到 Git，也不要把明文密码放进命令参数。

### 自动化调用（API Token）

配置 `HERMES_API_TOKEN`（至少 16 字符；服务端也兼容读取 `API_TOKEN`）后，受信任自动化流水线（如 Hermes）可通过 HTTP 请求头携带 `Authorization: Bearer <TOKEN>` 调用管理接口（如 `GET /api/guides?scope=admin`、`POST /api/guides`、`PATCH /api/guides/[id]`、发布/撤回与图片上传），无需浏览器 Cookie 且豁免同源限制；创建攻略时若指定 `publish: true` 且满足完整性校验可直接发布。

**注意**：这是现有管理员等价凭证，Token 删除攻略接口按用户确认继续保留。受限凭证及历史业务 MCP 服务端已部署并获得 Gemini 双端用户验收；2026 协议服务端已部署，但真实客户端尚未重新验收，配置后台尚未完成，不要把本节的凭证交给外部 AI 来满足“不允许删除”的产品目标。

## REST / MCP 路由边界

- `/api/*`：REST API，保留攻略、上传、OAuth 等现有路径。
- `/mcp`：唯一正式 MCP 入口，资源元数据为 `/.well-known/oauth-protected-resource/mcp`。
- 本轮迁移不保留 `/api/mcp` 别名或旧路径式元数据；旧资源的意图、授权码和令牌失效，客户端需重新授权。固定数据 `/api/mcp-probe` 不变。
- 路由迁移已获用户确认并上线：正式接入地址 `https://travel.keyi.win/mcp`，路由迁移见[记录](./docs/deployments/2026-10-10-mcp-route.md)，当前镜像见本文“当前状态”，旧批次[固定镜像及回滚证据](./docs/deployments/2026-10-23-review-fixes.md)保留。

## MCP 2026 客户端请求

2026 现代模式每次调用都必须携带下列头部和元数据；标准 MCP 客户端（如 Gemini）则走标准 `initialize` 握手。以下是取得受限 OAuth Token 后的 2026 发现请求示例，Token 占位符不能使用管理员 API Token 替代：

```http
POST /mcp HTTP/1.1
Authorization: Bearer <受限 OAuth Token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover

{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

现代模式的 `tools/list` 同样每次携带 `_meta` 和对应的 `Mcp-Method`；调用工具时再携带原样安全 ASCII 或 `=?base64?{标准 Base64}?=` 形式的 `Mcp-Name`，解码后与 `params.name` 一致，不做百分号解码。客户端能力不是授权，服务端仍逐请求验证令牌、scopes、resource 与客户端撤销状态。仅支持 JSON 响应，不提供 SSE/订阅/会话；`/api/mcp-probe` 是保留的旧协议固定数据探针，不代表正式服务的 2026 兼容性。

现有 OAuth 资源与令牌未轮换；客户端升级协议不等于需要重新授权或自动扩权。DCR 虽已在 2026 规范弃用，本项目继续现有注册流程，不宣称支持 CIMD。正式 `/mcp` 的双协议分流已通过可溯源镜像部署，真实 Gemini 兼容性待重新验收。相关背景与决定见[协议与补充说明](./docs/decisions/2026-10-21-mcp-2026-migration.md)。

## 已审查镜像的生产发布

生产从明确的 Git 提交快照构建不可变镜像，记录 revision 与源码归档 SHA-256；禁止把 dirty 工作树混入部署。提交、push 和部署分别需要用户授权。

`scripts/build-release.sh` 只归档指定提交，排除工作树中未提交及未跟踪文件；镜像使用完整提交标签，已有同名镜像会被拒绝覆盖。构建后校验 `org.opencontainers.image.revision` 与 `win.keyi.travel-cards.source-sha256`，并输出镜像 ID，标签不符即失败。开发用 Compose 构建仍可带 `unknown` 标签，不能作为可溯源发布。

```bash
reviewed_commit="已审查的完整提交哈希"
./scripts/build-release.sh "$reviewed_commit"
TRAVEL_CARDS_TEST_IMAGE="travel-cards:git-$reviewed_commit" npm run test:oauth
```

这两个步骤只构建并隔离验证镜像，不会替换运行服务。2026-10-27 获用户上线授权后，本轮修复已按此流程构建、隔离验收并上线；运行镜像来源可核验，本轮未 push。

`docker-compose.yml` 显式支持通过 `TRAVEL_CARDS_IMAGE` 选择通过审查/隔离验证的不可变镜像；用 `--no-deps --no-build --pull never web` 只替换 Web，不改共用 MongoDB或凭证。新功能默认关闭；生产启用需要本轮上线授权，真实 Gemini 验收由管理员自行完成。部署记录必须保存源清单、审查、镜像、原镜像/开关及公开 smoke；回滚复用原镜像和开关。

`npm run deploy`（`./scripts/deploy.sh`）校验镜像完整 revision 与本地 Git 归档 SHA，默认以同一 image ID 执行 `test:oauth` 并切换 Web；`--skip-tests` 只跳过隔离测试，不跳过溯源检查。`compose up` 失败、运行镜像不匹配或健康失败均触发回滚，恢复旧镜像、环境、端口、网络别名及日志配置，并重新核对镜像与健康。原容器存在本项目未支持的挂载、资源或特殊安全配置时，在切换前拒绝。回滚失败会明确报错并保留私有恢复快照（目录 700、文件 600）；快照含凭证，不得提交或分享，恢复完成后删除。成功部署或成功回滚会清理快照。首次部署无旧容器时只报告无法回滚；fake 测试不证明生产回滚已执行；本次生产切换成功，未触发回滚。

## Docker 运行

Compose 只启动 Web，并接入 Meemo 已提供的 `mongodb` 服务及现有边缘代理网络。先确保 Meemo 的 `mongodb` 容器和 `meemo_backend` 网络已运行；新环境只需创建边缘网络：

```bash
docker network inspect nginx-network >/dev/null 2>&1 || docker network create nginx-network
docker inspect mongodb >/dev/null
docker network inspect meemo_backend >/dev/null
docker compose config >/dev/null
docker compose up -d --build
docker compose ps
```

以上构建命令用于本地开发/新环境。现有生产更新使用上一节的固定镜像流程；本地遗留 `deploy.sh` 已校验归档并移出根目录，不作为生产发布入口。

默认入口：

- 公开页面：<http://localhost:3100>
- 管理页面：<http://localhost:3100/admin/guides>
- MongoDB：复用 Meemo 的 `mongodb` 服务，由 Meemo 项目负责生命周期和数据卷

如 3100 被占用，可在 shell 中设置 `APP_PORT`，并让 `.env.local` 中的 `AUTH_URL` 使用同一端口。

停止 Travel Cards Web（不会停止或删除共用 MongoDB）：

```bash
docker compose down
```

## 非 Docker 开发

需要可访问的 MongoDB，并让 `MONGODB_URI` 指向一个明确数据库名：

```bash
npm ci
npm run dev -- --port 3100
```

开发端口需与 `AUTH_URL` 一致；Next.js 默认的 3000 端口与示例配置的 3100 不同。

## 验证

默认验证会创建并清理本次运行专用的临时 MongoDB，不连接共用生产实例：

```bash
npm run verify
```

`verify` 依次执行 lint、类型检查、Vitest 单元/集成测试、Next.js 生产构建和 Compose 配置检查；不包含 `test:http`。单独运行的 HTTP smoke 覆盖直接发布、已发布更新、撤回、删除，以及首页、搜索、API、详情、metadata/RSC 与 sitemap 的 no-store 可见性和数据库健康故障恢复。`test:oauth` 在 HTTP smoke 上加入真实 HTTP 路径的 fake OAuth/MCP 闭环，`test:recovery` 独立验证合成备份恢复；两者于 2026-10-27 恢复，不在默认 `verify` 中。运维约束与恢复验证范围见 [`docs/backup-restore.md`](./docs/backup-restore.md)。测试不会调用真实 Gemini 或 R2；真实 provider smoke 是手动、显式且可能计费的操作，未获得确认时不得运行。

常用单项检查命令（测试需 Docker；类型检查不启动 MongoDB）：

- `npm test`：运行 Vitest 单元与集成测试（`tests/*.test.ts`、`tests/*.test.tsx`）
- `npm run typecheck`：Next.js 路由类型生成与 TypeScript 静态检查
- `npm run test:http`：生产启动路径与健康检查 HTTP smoke；先运行 `npm run build` 生成生产构建，或传入 `TRAVEL_CARDS_TEST_IMAGE=<image-id>`
- `npm run test:oauth`：REST/健康 + OAuth/MCP HTTP 闭环；同样支持 `TRAVEL_CARDS_TEST_IMAGE`，仅合成账号与独立 MongoDB
- `npm run test:recovery`：合成数据库/图片备份恢复，不访问生产 MongoDB/R2
- `node scripts/cleanup-orphaned-images.mjs`：扫描 R2 孤立未引用图片与附件（默认安全预览 dry-run，加 `--execute` 显式执行）

数据库测试使用 `npm test` 或 `npm run test:watch`，不要直接运行 `vitest` 或 `npm run test:vitest`；后者仅供临时 Mongo 包装脚本调用。

## 主要入口

- `src/app/`：页面和 Route Handlers
- `src/lib/capabilities.ts`：服务端能力矩阵；`src/auth.ts` 的 `requireCapability` 在认证后校验
- `src/lib/mcp/guide-tools.ts`：七个受限 MCP 工具定义与执行器，已接入 OAuth 鉴权后的 HTTP adapter
- `src/lib/mcp/access-grants.ts`：长效访问令牌签发、资源/scopes 校验及撤销；公网签发仅经过授权码/PKCE 流程
- `src/lib/guides/schema.ts`：Guide 输入输出结构与类型
- `src/lib/guides/repository.ts`：Mongoose 持久化和摘要/详情读取
- `src/lib/guides/service.ts`：Guide 业务规则；`src/lib/guides.ts` 仅保留兼容导出
- `src/lib/storage/r2.ts`：受限图片上传
- `src/lib/storage/attachments.ts`：受限路线轨迹（GPX/KML）与资料文档（PDF）上传及下载响应处理
- `src/lib/storage/fetch-image.ts`：MCP 公网 HTTPS 图片下载，逐跳 DNS 校验、固定连接地址与 429/503 瞬态轻量退避重试
- `src/lib/storage/fetch-attachment.ts`：MCP 公网 HTTPS 轨迹与文档下载
- `scripts/cleanup-orphaned-images.mjs`：R2 孤立图片与附件安全扫描与清理运维工具（默认 dry-run 预览，需 `--execute` 显式确认，带 24 小时安全宽限期与二次复核防竞态保护）
- `scripts/`：隔离测试环境、REST/OAuth/MCP HTTP smoke、合成恢复演练、提交快照镜像构建与发布、孤立存储清理、管理员密码生成脚本
- `docker-compose.yml`：接入 Meemo 共用 MongoDB 的 Web 服务

## 清理边界

正式审查证据保存在 `docs/reviews/`，临时源码快照和日志归档必要证据后清理；旧回滚脚本不得作为当前运维入口。保留凭证、备份、静态资源、历史审查、依赖和构建缓存；不改动共享 MongoDB 或其他项目。

`src/lib/guides.ts` 仍被调用；SPEC 明确保留的内部令牌签发/撤销能力不按“仅测试引用”删除。2026-10-23 早期清理移除鉴权辅助函数中无人调用的无 Request 分支和两个 AI schema 转发函数，并合并一处重复 MCP 请求断言；该批没有删除测试套件。后续 `fc5ebc1` 删除了边界/发布构建测试与独立 smoke 脚本，不能将早期测试数量或覆盖范围沿用到当前版本。

`tmp/` 的旧发布快照、日志及重复证据已校验归档到本地忽略目录 `backups/cleanup-2026-10-21/` 后清空，2026-10-27 检查时仍为空；独有的候选源码未丢弃。旧发布脚本另存于 `backups/cleanup-2026-10-23/legacy-deploy.tar.gz`，归档内容与原文件逐字节核对后才移除原件；原文件 SHA-256 为 `c505c6656ae00c14d912aa4d102bd17862df29846b80f7cb73c117288839e93d`。归档不代替正式发布证据，历史风险与检查见[维护记录](./docs/maintenance/2026-10-21-review-cleanup.md)。

2026-10-23 审查修复后验证：24 个测试文件、303 项通过；lint、额外未使用符号检查、默认 Turbopack 构建（fake 环境）和 Compose 配置检查通过；隔离 HTTP/OAuth smoke 通过。DNS/IPv6/重定向/大小/超时边界与上传前权限已通过 fake transport 回归；发布脚本先使用 fake Docker 验证提交快照、标签校验与拒绝覆盖，随后实际构建并验收固定镜像。编辑内容保护、保存期间继续输入、错误提示、本地时间/UTC 往返和搜索故障恢复均已通过本地浏览器验证，详见[前端记录](./docs/frontend.md#浏览器审查2026-10-23)。应用已提交并部署，发布证据见[记录](./docs/deployments/2026-10-23-review-fixes.md)；真实 Gemini/R2、真实手机与生产恢复未验收。
