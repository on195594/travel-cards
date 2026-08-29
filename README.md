# Travel Cards

面向公开浏览、由单一管理员维护的中文旅行攻略应用。管理员可编辑和发布结构化攻略、上传 R2 封面，并使用 Gemini + Google Search 生成带来源的候选内容；AI 结果必须人工采纳后再通过普通保存流程持久化。

## 当前状态

- Next.js 16、Auth.js、MongoDB、Guide CRUD/发布/撤回和 Cloudflare R2 上传代码已落地。
- Gemini 本地实现与离线测试正在收尾；真实 Gemini/R2 smoke 未运行，仍需单独确认和凭证。
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
- `MONGODB_URI`（Compose 会覆盖为容器内地址）
- R2 与 Gemini 变量；未配置时只有对应操作不可用，已有攻略浏览不受影响

不要把 `.env.local` 提交到 Git，也不要把明文密码放进命令参数。

## Docker 运行

```bash
docker compose config
docker compose up -d --build
docker compose ps
```

默认入口：

- 公开页面：<http://localhost:3100>
- 管理页面：<http://localhost:3100/admin/guides>
- MongoDB：仅监听 `127.0.0.1:27017`

如 3100 被占用，可在 shell 中设置 `APP_PORT`，并让 `.env.local` 中的 `AUTH_URL` 使用同一端口。

停止服务但保留 MongoDB volume：

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

```bash
npm test
npm run lint
npm run build
docker compose config
```

默认测试不会调用 Gemini 或 R2。真实 provider smoke 是手动、显式且可能计费的操作；未获得确认时不得运行。

## 主要入口

- `src/app/`：页面和 Route Handlers
- `src/lib/guides.ts`：Guide 聚合、验证和 MongoDB 操作
- `src/lib/storage/r2.ts`：受限图片上传
- `docker-compose.yml`：Web + MongoDB 本地栈
