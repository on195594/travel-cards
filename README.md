# Travel Cards

供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台，公开展示与分享同一份结构化攻略。

## 当前状态

- 生产：<https://travel.keyi.win>，运行 `2a18577`（应用代码同 `3f4544b`，2026-10-29 MCP 执行优化），OAuth 启用。回退：`npm run deploy -- <上一提交> --skip-tests`，本机保留旧镜像 `travel-cards:git-<提交>`。
- 已实现：Next.js 16、Auth.js、MongoDB；攻略 CRUD／发布／撤回；R2 封面及 GPX/KML/PDF 附件；应用内 Gemini + Google Search 候选助手（只生成待采纳草稿）。
- MCP：正式入口 `/mcp`，七个工具（list/get/create/update/publish、`upload_image`、`upload_attachment`），支持 2026 协议与标准 MCP 兼容模式；OAuth/DCR/PKCE 与管理员同意／撤销；受限令牌不可删除或管理配置，每令牌 120 次/分钟。
- 待做：2026 协议下真实 Gemini 网页／手机端重新验收；非敏感配置后台。

文档：[SPEC](./SPEC.md)（权威契约）、[PRODUCT](./PRODUCT.md)、[AGENTS](./AGENTS.md)、[docs 导航](./docs/README.md)。

## 本地配置

```bash
cp .env.example .env.local
printf '%s' '你的管理员密码' | node scripts/hash-admin-password.mjs
```

把输出的 `scrypt$...` 写入 `.env.local` 的 `ADMIN_PASSWORD_HASH`，并填写：

- `AUTH_URL`（默认 `http://localhost:3100`）、`AUTH_SECRET`（≥32 字符）、`ADMIN_EMAIL`
- `HERMES_API_TOKEN`：受信任自动化的 Bearer Token（≥16 字符，可选；兼容旧名 `API_TOKEN`）
- `MCP_OAUTH_ENABLED`：默认关闭，控制 OAuth 发现／注册／授权及同意／撤销页面
- `MCP_ALLOWED_ORIGINS`：额外精确 Origin，逗号分隔；默认已允许 `AUTH_URL` 同源与 `https://gemini.google.com`
- `MONGODB_URI`（Compose 使用 Meemo 共用的 `mongodb` 服务）
- R2 与 Gemini 变量；未配置时只有对应操作不可用

不要提交 `.env.local`，也不要把明文密码放进命令参数。

### 自动化调用（API Token）

`Authorization: Bearer <HERMES_API_TOKEN>` 可调用管理接口（`GET /api/guides?scope=admin`、`POST /api/guides`、`PATCH /api/guides/[id]`、发布／撤回、上传），无需 Cookie。这是**管理员等价凭证**（含删除），不得交给外部 AI；外部 AI 只用 OAuth 受限令牌。

## REST / MCP

- `/api/*`：REST 与 OAuth 端点；`/api/mcp-probe` 为旧协议固定数据探针。
- `/mcp`：唯一正式 MCP 入口，资源元数据 `/.well-known/oauth-protected-resource/mcp`。
- 2026 模式每次请求携带 `MCP-Protocol-Version`、`Mcp-Method`（调用工具时加 `Mcp-Name`）及 `params._meta`；标准客户端（如 Gemini）走 `initialize` 握手。仅 JSON 响应，无 SSE／会话。

```http
POST /mcp HTTP/1.1
Authorization: Bearer <受限 OAuth Token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover

{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}
```

协议细节见 [MCP 协议决定](./docs/decisions/2026-10-21-mcp-2026-migration.md) 与 SPEC 3.3；Gemini 接入限制与排障见 [接入路线图](./docs/roadmaps/ai-client-integration.md)、[OAuth 排障](./docs/gemini-oauth-troubleshooting.md)。

## 部署

```bash
npm run deploy -- <commit> [--skip-tests]
```

`scripts/deploy.sh` 从指定提交的 Git 归档构建不可变镜像（`travel-cards:git-<commit>`，已存在则复用），校验 revision 与源码 SHA，默认对该镜像跑 `test:oauth`，然后只替换 Web（不动共用 MongoDB／Nginx）并检查健康；失败自动恢复原镜像与配置。该提交已通过测试时加 `--skip-tests`。提交、push、部署分别需要授权。

## Docker 与本地开发

Compose 只启动 Web，接入 Meemo 的 `mongodb` 服务（`meemo_backend` 网络）和边缘网络 `nginx-network`：

```bash
docker network inspect nginx-network >/dev/null 2>&1 || docker network create nginx-network
docker compose up -d --build   # 本地/新环境；生产用 npm run deploy
docker compose down            # 不会停止共用 MongoDB
```

非 Docker：`npm ci && npm run dev -- --port 3100`（端口与 `AUTH_URL` 一致）。

## 验证

测试会创建并清理专用临时 MongoDB，不连生产实例：

- `npm test`：Vitest 单元与集成（不要直接跑 `vitest`）
- `npm run lint`、`npm run typecheck`、`npm run build`
- `npm run verify`：上述全部 + `docker compose config`
- `npm run test:http` / `test:oauth`：HTTP smoke 与 OAuth/MCP 闭环，可传 `TRAVEL_CARDS_TEST_IMAGE=<image>`
- `npm run test:recovery`：合成数据备份恢复，见 [backup-restore](./docs/backup-restore.md)
- `node scripts/cleanup-orphaned-images.mjs`：R2 孤立文件扫描（默认 dry-run，`--execute` 执行）

测试不调用真实 Gemini 或 R2；真实 provider smoke 可能计费，须先确认。

## 主要入口

- `src/app/`：页面与 Route Handlers
- `src/lib/capabilities.ts`、`src/auth.ts`：能力矩阵与 `requireCapability`
- `src/lib/mcp/`：工具定义（`guide-tools.ts`）、HTTP 适配、OAuth 客户端、授权码与令牌（`access-grants.ts`）
- `src/lib/guides/`：schema / repository / service；`src/lib/guides.ts` 为统一导出
- `src/lib/storage/`：R2 上传、附件、公网图片／附件下载（逐跳 DNS 校验）
- `scripts/`：发布、隔离测试、HTTP smoke、恢复演练、孤立文件清理、密码生成
