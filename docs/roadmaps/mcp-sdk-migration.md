# `/mcp`：用官方 SDK 替换双协议服务

**已实施并部署上线（见 [README](../../README.md#当前状态)）。** 本次是破坏性迁移，不是给旧接口换一个底层库。在同一变更中把七个工具接入官方 TypeScript SDK，删除旧协议实现，不做试点、双轨运行或兼容期。目标是下次升级协议时不必再修改应用自己的 JSON-RPC 分发器。

## 客户端要改什么

正式地址和 OAuth resource 仍是 `/mcp`。客户端须使用 `2026-07-28` 现代协议：可先 `server/discover`，也可按协议直接调用工具。**不再支持**旧 `initialize` 握手、`ping` 或无现代元数据的工具调用；不再为旧客户端改写 Accept、补请求头、模拟握手或翻译错误。通知是否收到传输层确认不代表握手成功或可以执行工具。

只会旧握手的 Gemini 或其他客户端，即使 OAuth 授权成功，切换后也不能使用工具。升级客户端，而不是切回服务端兼容模式。历史 Gemini 双端验收不适用于新接口。七个工具继续提供原有攻略与上传能力；每个工具仅声明 `inputSchema` 并返回 `{ structuredContent }`（多态写工具不强套联合 `outputSchema`，文本块交由 SDK 按 SEP-2106 处理，409／404 等业务执行期失败以及补丁合并后产生的跨域校验错误继续返回 `structuredContent.error` 与 `isError: true`，其中合并后 `ZodError` 保留 `400 / VALIDATION_ERROR` 与字段 `issues`；入参 schema 校验失败返回文本 `isError: true`、未知工具返回 HTTP `200` / `-32602`、无法确定请求 `id` 时返回 `id: null`、无 `id` 消息按通知 `202` 丢弃均遵循 SDK 原生行为，客户端不依赖手写版的自定义协议错误或双写副本）。

## 实施时一次删干净

1. 在 `src/app/mcp/route.ts` 使用 `@modelcontextprotocol/server` 的公开 HTTP 入口。核对并锁定实施时的官方稳定版；[决策时的 v2.4.0](https://github.com/modelcontextprotocol/typescript-sdk/blob/v2.4.0/docs/serving/legacy-clients.md) 须显式配置 `createMcpHandler(factory, { legacy: 'reject', responseMode: 'json', maxSubscriptions: 0, keepAliveMs: 0 })`（关闭默认的无状态旧协议回退、4 MiB 请求体、SSE 升级与 1024 路 `subscriptions/listen` 订阅流），`McpServer` 显式声明 `capabilities: { tools: { listChanged: false } }` 及 `server/discover`、`tools/list` 的 `{ ttlMs: 0, cacheScope: 'private' }` `cacheHints`。外层先处理 `MCP_OAUTH_ENABLED` 404、CORS `OPTIONS` 204/403、Origin 允许列表、OAuth Bearer 鉴权（未认证非 POST 返 401 挑战，已认证非 POST 返 `405 Allow: POST`）及 `Accept` 拒绝 JSON 的 406，再用现有 `readJsonBody` 执行 2 MiB 有界读取后通过 `handler.fetch(request, { authInfo, parsedBody })` 传入，避免二次克隆读流。
2. 用 SDK 原生注册七个工具（由 `src/lib/mcp/guide-tools.ts` 提供单一工具元数据与 `McpServer` 注册入口），每个工具只有一份定义、输入 schema 和执行函数。迁走 `src/lib/mcp/http-server.ts` 中仍需的应用检查后删除旧分发器；不保留 `mcpPost` 等旧导出的转发壳，也不再由 `listGuideTools` 手组协议列表、由 `callGuideTool` 按名字二次派发。SDK 负责协议识别、头与消息绑定、发现、派发及结果封装；应用不再根据 RPC method/version 选择一套行为。
3. **保留应用责任，不保留协议包袱。** `McpServer` 会捕获工具回调异常并转为 HTTP `200` `isError: true`，且内置 `scopeChallenge` 不覆盖因缺权限而未注册的隐藏工具；因此当请求通过 SDK 现代头与 `_meta` 校验进入已知工具调用时，须在进入 `McpServer` 工具回调前（或经请求级响应短路）基于同一份工具元数据完成组合权限校验（含 `create_guide` + `publish:true`、`upload_*` + `guideId`，缺权限返回 HTTP `403` 与最小 step-up `WWW-Authenticate` 挑战，不能退化为 `-32602 Tool not found`）及每令牌 120 次/分钟持久限流（超限返回 HTTP `429` 与 `Retry-After`，计数存储故障返回 HTTP `500` / `-32603` 且不执行工具）。外层统一为 `handler.fetch` 的所有响应附加 `OAUTH_HEADERS`、`X-Content-Type-Options: nosniff` 与浏览器可读的 CORS 头。保留修订冲突不覆盖与审计；本次不改 OAuth 注册／换码、令牌、数据库、管理 REST 或独立的固定数据探针 `/api/mcp-probe`。

## 怎么判断迁移完成

- **看代码：** 正式入口只有一个 SDK handler、一套工具注册；不再有手写版本分流、第二个工具分发器、旧端点别名或兼容开关。七个工具全部迁完才删除被替代的实现，不以净删行数代替这一判断。
- **看行为：** 在 `tests/mcp-http.test.ts` 与 `scripts/oauth-http-smoke.mjs` 中，把原来验证旧握手及无现代头调用成功的断言改成“旧握手不能建立连接、无 `id` 或旧写请求无副作用（含通知 `202` 丢弃）”，按 SDK 原生行为对齐现代协议断言（未知工具 `200` / `-32602`、入参 schema 失败文本 `isError: true`、未知 `id` 返回 `id: null`），并删去绑定手写校验顺序和穷举 Base64 细节的冗余单测；同步迁移直接依赖旧导出的 `tests/mcp-guide-tools.test.ts` 与 `tests/mcp-access-grants.test.ts`（均改经正式 `/mcp` 现代 `2026-07-28` 入口驱动同一套注册工具，仅保留异常 actor 注册拒绝等纯单元测试），严禁为迁就旧测试保留废弃导出。原来覆盖的授权、限流、上传预检、并发 409 不重放、SSRF、撤销等业务测试全部保留在现代入口。最终提交跑 `npm run verify` 和候选镜像的 `npm run test:oauth`，不另设性能基线。
- **看发布：** 按 [README 部署流程](../../README.md#部署) 获授权后切换固定镜像；真实 Gemini 网页和手机的可用性按实际结果记录，不作为上线前置条件。旧客户端被拒是预期断点；若现代调用或权限、写入行为回归，按授权退回上一已知正常镜像，不回滚数据、不重放写请求。
