# Travel Cards

供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台，公开展示与分享同一份结构化攻略。

**当前实现**：管理员可编辑、发布、删除攻略、上传 R2 封面；应用内 Gemini + Google Search 只生成待采纳候选，通过普通保存流程持久化。现有受信任自动化 API Token 接口继续可用。

**服务端已上线、Gemini 双端验收已完成（用户确认）**：首先面向 Gemini 网页和手机 App 的业务 MCP/OAuth；受限外部 AI 可创建、修改及直接发布，但不得删除或管理配置。权限、六个工具、长效令牌及 OAuth/DCR/PKCE 同意撤销流程已实现，业务 MCP 已通过本轮门禁并部署，用户已确认真实 Gemini 网页/手机双端验收完成；非敏感配置后台仍待完成。服务密钥仍来自环境变量；既有管理员 Token 不能交给受限 AI。

## 当前状态

- Next.js 16、Auth.js、MongoDB、攻略 CRUD/发布/撤回、R2 上传和 Gemini 候选助手已实现。
- MCP 提供 list/get/create/update/publish 五个攻略工具及 `upload_image`。独立 `image.upload` scope 控制上传；直接替换封面还需 `guide.update` 和 expectedRevision，禁止删除、撤回及配置管理。
- OAuth/DCR/PKCE、管理员同意/撤销已实现。新环境默认关闭，当前生产显式启用。令牌与客户端注册默认 100 × 365 天有效，并非永不过期；无 refresh token。旧注册与令牌不自动扩权或续期，需要重新注册授权。
- 最近部署应用提交 `d260439`，固定镜像与回滚信息见[发布记录](./docs/deployments/2026-10-12-cleanup-release.md)。本轮只读核对容器 revision 一致；Git HEAD 中的文档更新不代表镜像重建。
- 真实 Gemini 网页/手机双端验收已完成，依据为 2026-10-12 用户确认，见[验收状态记录](./docs/roadmaps/ai-client-integration.md#真实双端验收用户确认)。图片上传专项验收未单独确认，非敏感配置后台尚未实现。服务端单测与用户真实验收分别记录。
- 历史核心实现与内部令牌审查分别见[核心审查](./docs/reviews/agy-final-implementation/closeout.md)、[7cc88f8 审查](./docs/reviews/agy-7cc88f8/closeout.md)；历史 APPROVE 仅覆盖当时范围。
- 当前开发目录：`/home/lin/travel-cards`
- 权威需求与权限契约：[SPEC.md](./SPEC.md)
- 已确认产品定位：[PRODUCT.md](./PRODUCT.md)
- 项目约束：[AGENTS.md](./AGENTS.md)
- 现有 UI 与 Impeccable 工作流：[docs/frontend.md](./docs/frontend.md)
- 外部 AI / MCP 接入边界与 Gemini 官方限制：[docs/roadmaps/ai-client-integration.md](./docs/roadmaps/ai-client-integration.md)
- UI 精修及 AGY 复审：[docs/reviews/ui-impeccable-review.md](./docs/reviews/ui-impeccable-review.md)

Gemini 自定义 MCP 应用目前有地区、年龄、账号和语言限制，并要求客户端确认写操作；网页连接后才可在手机 App 使用。本项目双端接入已由用户确认验收完成；该结果不代表所有账号或地区均可用，详见接入文档。

Impeccable 已初始化 `PRODUCT.md`，用户选择的新页面构建默认是代码优先，保存在 `.impeccable/config.json`。开发期 live setup 已记录，但未注入或启动；本轮未重做视觉系统。

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

**注意**：这是现有管理员等价凭证，Token 删除攻略接口按用户确认继续保留。受限凭证及业务 MCP 服务端已部署，真实 Gemini 双端验收已由用户确认完成，配置后台尚未完成，不要把本节的凭证交给外部 AI 来满足“不允许删除”的产品目标。

## REST / MCP 路由边界

- `/api/*`：REST API，保留攻略、上传、OAuth 等现有路径。
- `/mcp`：唯一正式 MCP 入口，资源元数据为 `/.well-known/oauth-protected-resource/mcp`。
- 本轮迁移不保留 `/api/mcp` 别名或旧路径式元数据；旧资源的意图、授权码和令牌失效，客户端需重新授权。固定数据 `/api/mcp-probe` 不变。
- 路由迁移已获用户确认并上线：正式接入地址 `https://travel.keyi.win/mcp`，路由迁移见[记录](./docs/deployments/2026-10-10-mcp-route.md)，当前发布见[最新发布及回滚证据](./docs/deployments/2026-10-12-cleanup-release.md)。历史发布/审查证据不改写。

## 已审查镜像的生产发布

生产从明确的 Git 提交快照构建不可变镜像，记录 revision 与源码归档 SHA-256；禁止把 dirty 工作树混入部署。提交、push 和部署分别需要用户授权。

`docker-compose.production.yml` 显式选择已经通过审查/隔离验证的不可变镜像；用 `--no-deps --no-build --pull never web` 只替换 Web，不改共用 MongoDB或凭证。新功能默认关闭；生产启用需要本轮上线授权，真实 Gemini 验收由管理员自行完成。部署记录必须保存源清单、审查、镜像、原镜像/开关及公开 smoke；回滚复用原镜像和开关。不要用旧 `deploy.sh` 覆盖这一固定镜像发布。

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

以上构建命令用于本地开发/新环境。现有生产更新使用上一节的固定镜像流程；本地遗留 `deploy.sh` 不随仓库分发，不作为生产发布入口。

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
npm run dev
```

## 验证

默认验证会创建并清理本次运行专用的临时 MongoDB，不连接共用生产实例：

```bash
npm run verify
```

`verify` 依次执行 lint、类型检查、隔离测试、合成数据库/图片恢复、生产构建、Compose 配置检查和生产启动路径 HTTP smoke。HTTP smoke 覆盖直接发布、已发布更新、撤回、删除，以及首页、搜索、API、详情、metadata/RSC 与 sitemap 的 no-store 可见性。恢复边界与共享 MongoDB 运维约束见 [`docs/backup-restore.md`](./docs/backup-restore.md)。测试不会调用真实 Gemini 或 R2；真实 provider smoke 是手动、显式且可能计费的操作，未获得确认时不得运行。

常用单项检查命令（测试需 Docker；类型检查不启动 MongoDB）：

- `npm test`：运行 Vitest 单元与集成测试（`tests/*.test.ts`）
- `npm run typecheck`：Next.js 路由类型生成与 TypeScript 静态检查
- `npm run test:recovery`：隔离合成数据库与图片恢复测试
- `npm run test:http`：生产启动路径与健康检查 HTTP smoke；先运行 `./scripts/build-with-test-env.sh` 生成隔离配置的生产构建

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
- `scripts/`：测试环境准备、HTTP smoke、恢复演练与管理员密码生成脚本
- `docker-compose.yml`：接入 Meemo 共用 MongoDB 的 Web 服务

## 清理边界

正式审查证据保存在 `docs/reviews/`，临时源码快照和日志归档必要证据后清理；旧回滚脚本不得作为当前运维入口。保留凭证、备份、静态资源、历史审查、依赖和构建缓存；不改动共享 MongoDB 或其他项目。

`src/lib/guides.ts` 仍被调用；MCP 授权/工具模块已在线使用，不按“仅测试引用”当死代码删除。测试保留权限拒绝、scope/resource、过期撤销、409 和输入边界覆盖；本次未发现可安全删除的重复测试套件。最新清理记录见 [维护记录](./docs/maintenance/2026-10-12-cleanup.md)，此前记录保留在历史文档中。
