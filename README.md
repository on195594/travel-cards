# Travel Cards

面向公开浏览、由单一管理员维护的中文旅行攻略应用。管理员可编辑和发布结构化攻略、上传 R2 封面，并使用 Gemini + Google Search 生成带来源的候选内容；AI 结果必须人工采纳后再通过普通保存流程持久化。

## 当前状态

- Next.js 16、Auth.js（支持管理后台 Session 与外部流程 Bearer API Token）、MongoDB、Guide CRUD/发布/撤回、Cloudflare R2 上传和 Gemini grounded assistant 已落地。
- 当前代码状态以本仓库 HEAD 和下方验证命令为准；历史实现审查、测试及 provider smoke 证据见 [`docs/reviews/agy-final-implementation/closeout.md`](./docs/reviews/agy-final-implementation/closeout.md)。
- 真实 Gemini grounded structured-output smoke 与 R2 S3 上传/读回/删除 smoke 均已通过；R2 使用现有私有备份 bucket 验证传输，旅行图片专用 bucket/public base 仍需部署时配置。
- 最终独立 AGY 审查返回 `APPROVE`；后续真实 smoke 暴露并验证修复了 Gemini schema 兼容问题。
- 当前开发目录：`/home/lin/travel-cards`
- 权威需求：[SPEC.md](./SPEC.md)
- 项目约束：[AGENTS.md](./AGENTS.md)

## 本地配置

```bash
cp .env.example .env.local
printf '%s' '你的管理员密码' | node scripts/hash-admin-password.mjs
```

将输出的 `scrypt$...` 写入 `.env.local` 的 `ADMIN_PASSWORD_HASH`，并填写：

- `AUTH_URL`：默认 `http://localhost:3100`
- `AUTH_SECRET`：至少 32 个字符
- `ADMIN_EMAIL`
- `HERMES_API_TOKEN`：Hermes 等外部流程调用 API 的 Bearer Token（至少 16 字符，可选）
- `MONGODB_URI`（Compose 使用 Meemo 共用的 `mongodb` 服务）
- R2 与 Gemini 变量；未配置时只有对应操作不可用，已有攻略浏览不受影响

不要把 `.env.local` 提交到 Git，也不要把明文密码放进命令参数。

### 自动化调用（API Token）

配置 `HERMES_API_TOKEN`（至少 16 字符）后，外部自动化流水线（如 Hermes）可通过 HTTP 请求头携带 `Authorization: Bearer <TOKEN>` 调用管理接口（如 `GET /api/guides?scope=admin`、`POST /api/guides`、`PATCH /api/guides/[id]`、发布/撤回与图片上传），无需浏览器 Cookie 且豁免同源限制；创建攻略时若指定 `publish: true` 且满足完整性校验可直接发布。

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

测试需要正在运行的共用 MongoDB；测试配置使用宿主机的 `127.0.0.1:27017`：

```bash
docker inspect mongodb >/dev/null
npm test
npm run lint
npm run build
docker compose config >/dev/null
docker compose down
```

测试不会调用真实 Gemini 或 R2，但并非完全自包含：它依赖上面启动的 MongoDB。真实 provider smoke 是手动、显式且可能计费的操作；未获得确认时不得运行。

## 主要入口

- `src/app/`：页面和 Route Handlers
- `src/lib/guides.ts`：Guide 聚合、验证和 MongoDB 操作
- `src/lib/storage/r2.ts`：受限图片上传
- `docker-compose.yml`：接入 Meemo 共用 MongoDB 的 Web 服务
