# Travel Cards

供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台，公开展示与分享同一份结构化攻略。

**当前实现**：管理员可编辑、发布、删除攻略、上传 R2 封面；应用内 Gemini + Google Search 只生成待采纳候选，通过普通保存流程持久化。现有受信任自动化 API Token 接口继续可用。

**已批准、待实现**：MCP 接入，首先面向 Gemini 网页和手机 App；受限外部 AI 可创建、修改及直接发布，但不得删除或管理配置。管理员将管理非敏感应用配置，凭证仍来自环境变量。当前 Token 权限过宽，不能直接交给 AI 作为受限凭证。

## 当前状态

- Next.js 16、Auth.js（支持管理后台 Session 与外部流程 Bearer API Token）、MongoDB、Guide CRUD/发布/撤回、Cloudflare R2 上传和 Gemini grounded assistant 已落地。
- 架构路线图当前批次已完成本地验收：T0-01～07（T0-05/06 的生产与真实 R2 证明仍需单独授权）、T1-01/02A/03/04、T2-01/02/03；T1-02B 与 T3 未混入本批次。
- 当前代码状态以本仓库工作树和下方验证命令为准；历史实现审查、测试及 provider smoke 证据见 [`docs/reviews/agy-final-implementation/closeout.md`](./docs/reviews/agy-final-implementation/closeout.md)。
- 真实 Gemini grounded structured-output smoke 与 R2 S3 上传/读回/删除 smoke 均已通过；R2 使用现有私有备份 bucket 验证传输，旅行图片专用 bucket/public base 仍需部署时配置。
- 最终独立 AGY 审查返回 `APPROVE`；后续真实 smoke 暴露并验证修复了 Gemini schema 兼容问题。
- 当前开发目录：`/home/lin/travel-cards`
- 权威需求与权限契约：[SPEC.md](./SPEC.md)
- 已确认产品定位：[PRODUCT.md](./PRODUCT.md)
- 项目约束：[AGENTS.md](./AGENTS.md)
- 现有 UI 与 Impeccable 工作流：[docs/frontend.md](./docs/frontend.md)
- 外部 AI / MCP 接入边界与 Gemini 官方限制：[docs/roadmaps/ai-client-integration.md](./docs/roadmaps/ai-client-integration.md)
- UI 精修及 AGY 复审：[docs/reviews/ui-impeccable-review.md](./docs/reviews/ui-impeccable-review.md)

Gemini 自定义 MCP 应用目前有地区、年龄、账号和语言限制，并要求客户端确认写操作；网页连接后才可在手机 App 使用。尚无本项目的双端接入成功证明，详见接入文档。

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
- `MONGODB_URI`（Compose 使用 Meemo 共用的 `mongodb` 服务）
- R2 与 Gemini 变量；未配置时只有对应操作不可用，已有攻略浏览不受影响

不要把 `.env.local` 提交到 Git，也不要把明文密码放进命令参数。

### 自动化调用（API Token）

配置 `HERMES_API_TOKEN`（至少 16 字符；服务端也兼容读取 `API_TOKEN`）后，受信任自动化流水线（如 Hermes）可通过 HTTP 请求头携带 `Authorization: Bearer <TOKEN>` 调用管理接口（如 `GET /api/guides?scope=admin`、`POST /api/guides`、`PATCH /api/guides/[id]`、发布/撤回与图片上传），无需浏览器 Cookie 且豁免同源限制；创建攻略时若指定 `publish: true` 且满足完整性校验可直接发布。

**注意**：这是现有管理员等价凭证，Token 删除攻略接口按用户确认继续保留。受限 AI 身份、MCP 与配置后台尚未实现，不要把本节的凭证交给外部 AI 来满足“不允许删除”的产品目标。

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

若本地已有仓库根目录的 `deploy.sh`，更新代码可运行 `./deploy.sh`；脚本会确认在 `main` 分支且工作树干净，快进同步 `origin/main`，构建并重启 Web，再检查 live/ready 健康状态。它不会停止或重建共用 MongoDB。该本地辅助脚本不随当前仓库分发，新检出使用上述 Compose 命令。

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
- `src/lib/guides/schema.ts`：Guide 输入输出结构与类型
- `src/lib/guides/repository.ts`：Mongoose 持久化和摘要/详情读取
- `src/lib/guides/service.ts`：Guide 业务规则；`src/lib/guides.ts` 仅保留兼容导出
- `src/lib/storage/r2.ts`：受限图片上传
- `scripts/`：测试环境准备、HTTP smoke、恢复演练与管理员密码生成脚本
- `docker-compose.yml`：接入 Meemo 共用 MongoDB 的 Web 服务

## 清理边界

本轮只清理确认无引用的类型别名、重复的窄屏 CSS 和本轮临时审查/预览产物；独立 AGY 原文保留在 `docs/reviews/agy-ui-review.txt`。保留 `src/lib/guides.ts` 兼容入口（仍有测试调用）、静态图片、历史审查、备份、依赖及构建缓存。新增 `.gitignore` 规则避免浏览器快照和 Impeccable 会话产物混入后续提交；不删除正式内容或改动共用 MongoDB。
