# Travel Cards

供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台，公开展示与分享同一份结构化攻略。

**当前实现**：管理员可编辑、发布、删除攻略、上传 R2 封面；应用内 Gemini + Google Search 只生成待采纳候选，通过普通保存流程持久化。现有受信任自动化 API Token 接口继续可用。

**MCP 双协议支持（2026-07-28 与标准 MCP 兼容模式）**：受限外部 AI 仍可创建、修改及直接发布，但不得删除或管理配置。六个工具、长效令牌及 OAuth/DCR/PKCE 不变；双协议兼容已随 `0dfe091` 于 2026-10-23 通过固定镜像隔离测试并部署，真实 Gemini 双端用户验收仍待重新验证。非敏感配置后台仍待完成，服务密钥仍来自环境变量；既有管理员 Token 不能交给受限 AI。

## 当前状态

- Next.js 16、Auth.js、MongoDB、攻略 CRUD/发布/撤回、R2 上传和 Gemini 候选助手已实现。
- MCP 提供 list/get/create/update/publish 五个攻略工具及 `upload_image`。独立 `image.upload` scope 控制上传；直接替换封面还需 `guide.update` 和 expectedRevision，禁止删除、撤回及配置管理。
- 正式 `/mcp` 已部署双协议：现代 2026 协议（`server/discover`、逐请求 `_meta` 与 HTTP 头绑定、`resultType: complete`）及标准 MCP 兼容模式（`initialize`、`notifications/*`、`ping`）。固定镜像已通过隔离 HTTP/OAuth 测试；每个受限令牌的工具调用上限为 120 次/分钟，超限返回 429 / Retry-After。见[协议与补充说明](./docs/decisions/2026-10-21-mcp-2026-migration.md)。
- OAuth/DCR/PKCE、管理员同意/撤销已实现。新环境默认关闭，当前生产显式启用。令牌与客户端注册默认 100 × 365 天有效，并非永不过期；无 refresh token。旧注册与令牌不自动扩权或续期，需要重新注册授权。
- 当前应用发布为 `0dfe091`：2026-10-23 北京时间 12:41 仅替换 `travel-cards-web-1`，运行镜像 ID 为 `sha256:8dcc1ff7e9bf2991e68e677b9ed57f01b6d07d0d0c75ab924a1ce02a82ee0944`，revision 与源码归档 SHA 均已核对。原无溯源镜像保留为回滚目标，详见[本次发布、验收及回滚记录](./docs/deployments/2026-10-23-review-fixes.md)。
- 本次发布包含图片 URL 下载边界、编辑内容保护、来源本地时间及搜索错误反馈修复。实际镜像隔离 HTTP/OAuth 测试、25 项公网检查和固定数据探针均通过；生产环境变量、OAuth 开关、端口和网络保持一致，共用 MongoDB、Nginx 未重启，未修改生产攻略或凭证。`80a2b8a` 的[历史发布证据](./docs/deployments/2026-10-21-mcp-2026-release.md)保留。
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
- 路由迁移已获用户确认并上线：正式接入地址 `https://travel.keyi.win/mcp`，路由迁移见[记录](./docs/deployments/2026-10-10-mcp-route.md)，当前发布见[固定镜像及回滚证据](./docs/deployments/2026-10-23-review-fixes.md)。历史发布/审查证据不改写。

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
TRAVEL_CARDS_TEST_IMAGE="travel-cards:git-$reviewed_commit" npm run test:http
```

这两个步骤只构建并隔离验证镜像，不会替换运行服务。2026-10-23 获用户提交/部署授权后，本轮修复已按此流程构建、隔离验收并上线；运行镜像的溯源缺口已闭合，本轮未 push。

`docker-compose.yml` 显式支持通过 `TRAVEL_CARDS_IMAGE` 选择通过审查/隔离验证的不可变镜像；用 `--no-deps --no-build --pull never web` 只替换 Web，不改共用 MongoDB或凭证。新功能默认关闭；生产启用需要本轮上线授权，真实 Gemini 验收由管理员自行完成。部署记录必须保存源清单、审查、镜像、原镜像/开关及公开 smoke；回滚复用原镜像和开关。也可以使用 `npm run deploy`（`./scripts/deploy.sh`），自动完成镜像构建、隔离预检、服务切换、健康检查与异常回滚；不要用旧 `deploy.sh` 覆盖这一固定镜像发布。

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

`verify` 依次执行 lint、类型检查、Vitest 单元/集成测试、Next.js 生产构建和 Compose 配置检查。HTTP smoke 覆盖直接发布、已发布更新、撤回、删除，以及首页、搜索、API、详情、metadata/RSC 与 sitemap 的 no-store 可见性。运维约束见 [`docs/backup-restore.md`](./docs/backup-restore.md)。测试不会调用真实 Gemini 或 R2；真实 provider smoke 是手动、显式且可能计费的操作，未获得确认时不得运行。

常用单项检查命令（测试需 Docker；类型检查不启动 MongoDB）：

- `npm test`：运行 Vitest 单元与集成测试（`tests/*.test.ts`）
- `npm run typecheck`：Next.js 路由类型生成与 TypeScript 静态检查
- `npm run test:http`：生产启动路径与健康检查 HTTP smoke；先运行 `npm run build` 生成生产构建
- 浏览器回归：`scripts/check-public-ui.mjs` 包含搜索失败/重试与响应布局检查；`scripts/check-editor-ui.mjs` 检查离开保护、首次/后续保存期间输入保留、字段错误与时区。后者只允许本机隔离预览，需合成账号、两日攻略及 Asia/Shanghai 浏览器时区，不连接生产后台。

数据库测试使用 `npm test` 或 `npm run test:watch`，不要直接运行 `vitest` 或 `npm run test:vitest`；后者仅供临时 Mongo 包装脚本调用。

## 主要入口

- `src/app/`：页面和 Route Handlers
- `src/lib/capabilities.ts`：服务端能力矩阵；`src/auth.ts` 的 `requireCapability` 在认证后校验
- `src/lib/mcp/guide-tools.ts`：六个受限 MCP 工具定义与执行器，已接入 OAuth 鉴权后的 HTTP adapter
- `src/lib/mcp/access-grants.ts`：长效访问令牌签发、资源/scopes 校验及撤销；公网签发仅经过授权码/PKCE 流程
- `src/lib/guides/schema.ts`：Guide 输入输出结构与类型
- `src/lib/guides/repository.ts`：Mongoose 持久化和摘要/详情读取
- `src/lib/guides/service.ts`：Guide 业务规则；`src/lib/guides.ts` 仅保留兼容导出
- `src/lib/storage/r2.ts`：受限图片上传
- `src/lib/storage/fetch-image.ts`：MCP 公网 HTTPS 图片下载，逐跳 DNS 校验与固定连接地址
- `scripts/`：测试环境准备、HTTP smoke、恢复演练与管理员密码生成脚本
- `docker-compose.yml`：接入 Meemo 共用 MongoDB 的 Web 服务

## 清理边界

正式审查证据保存在 `docs/reviews/`，临时源码快照和日志归档必要证据后清理；旧回滚脚本不得作为当前运维入口。保留凭证、备份、静态资源、历史审查、依赖和构建缓存；不改动共享 MongoDB 或其他项目。

`src/lib/guides.ts` 仍被调用；SPEC 明确保留的内部令牌签发/撤销能力不按“仅测试引用”删除。2026-10-23 清理移除鉴权辅助函数中无人调用的无 Request 分支和两个 AI schema 转发函数，并合并一处重复 MCP 请求断言；权限拒绝、scope/resource、过期撤销、409 和输入边界测试均保留，没有删除测试套件。

`tmp/` 的旧发布快照、日志及重复证据已校验归档到本地忽略目录 `backups/cleanup-2026-10-21/` 后清空，2026-10-23 检查时仍为空；独有的候选源码未丢弃。旧发布脚本另存于 `backups/cleanup-2026-10-23/legacy-deploy.tar.gz`，归档内容与原文件逐字节核对后才移除原件；原文件 SHA-256 为 `c505c6656ae00c14d912aa4d102bd17862df29846b80f7cb73c117288839e93d`。归档不代替正式发布证据，历史风险与检查见[维护记录](./docs/maintenance/2026-10-21-review-cleanup.md)。

2026-10-23 审查修复后验证：24 个测试文件、303 项通过；lint、额外未使用符号检查、默认 Turbopack 构建（fake 环境）和 Compose 配置检查通过；隔离 HTTP/OAuth smoke 通过。DNS/IPv6/重定向/大小/超时边界与上传前权限已通过 fake transport 回归；发布脚本先使用 fake Docker 验证提交快照、标签校验与拒绝覆盖，随后实际构建并验收固定镜像。编辑内容保护、保存期间继续输入、错误提示、本地时间/UTC 往返和搜索故障恢复均已通过本地浏览器验证，详见[前端记录](./docs/frontend.md#浏览器审查2026-10-23)。应用已提交并部署，发布证据见[记录](./docs/deployments/2026-10-23-review-fixes.md)；真实 Gemini/R2、真实手机与生产恢复未验收。
