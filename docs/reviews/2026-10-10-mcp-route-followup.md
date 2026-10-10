# MCP 路由迁移后续审查与修复

## 范围与结论

用户要求审查并修复此前变更。本次由当前助手直接审查，不是新的 AGY/Codex 独立评审。重点检查 `/mcp` 路由迁移、OAuth resource/metadata/challenge、旧资源拒绝及相连传输/测试；不将历史 APPROVE 当作本次结论。

相对已部署冻结源码 `a1d2bf926e3b53a935ed8bee2b0c49a5295364b072e78e98166fa28f5db01d83`，发现并修复两项协议兼容问题；未发现本轮路径迁移使旧绑定或管理员 Token 绕过受限认证的证据。结论仅适用于已检查路径，不是全库无漏洞保证。

## Findings（已本地修复）

### P2：Accept 协商丢弃权重，拒绝响应类型时仍执行业务工具

- 位置：`src/lib/mcp/http-server.ts`，原 `mcpPost` Accept 检查（部署版 74–75 行）；修复为 `acceptsJson` 及调用点。
- 复现：有效受限 Token 发送 `tools/call create_guide`，`Accept: application/json;q=0`。旧实现忽略分号后内容，执行写入并返回 JSON；`application/json;q=0, */*;q=1` 同样错误。合法 `Application/JSON` 和 `application/*` 又会被误拒绝。
- 影响：客户端明确不接受该响应格式时仍写入，可能产生结果不可处理与重试风险；不是未授权写入或鉴权绕过。
- 修复：按具体媒体范围优先级选择质量值，处理大小写、wildcard 和 q=0；不可接受时在读请求体/分派工具前返回 406。保留缺少 Accept 时的兼容行为，不新增依赖或通用协商框架。
- 依据：[RFC 9110 §12.4.2 / §12.5.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1)，q=0 不可接受，最具体匹配优先。

### P3：合法字符串请求 ID 被人为长度限制拒绝

- 位置：`src/lib/mcp/http-server.ts:10`，`requestId`。
- 复现：合法 `ping` 的 `id` 为 `""` 或 129 字符字符串，旧实现返回 HTTP 400，而非回显 ID 的 JSON-RPC 响应。
- 修复：删除字符串 ID 的最小/最大长度限制，仍保留有界请求体、数值 ID 校验、null 拒绝及通知不执行写入。成功与协议错误均测试精确回显。
- 依据：[MCP 官方 2025-11-25 schema](https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/2025-11-25/schema/2025-11-25/schema.ts)，RequestId 为 string | number，无非空/128 字符约束。

## 验证

新增测试先在原实现上运行：9 项中 2 项按上述原因失败；修复后：

- `npm test`：20 文件，266 项通过。
- `npm run lint`、`npx tsc --noEmit`：通过。
- `bash scripts/build-with-test-env.sh`：隔离环境执行 `npm run build`，通过。
- `docker compose config`、脚本语法与 `git diff --check`：通过。
- `npm run test:oauth`：通过；原管理 CRUD 和完整 OAuth/MCP 回归保持通过，新增真实本地 HTTP 的空/长 ID、大小写 Accept、q=0 + wildcard 检查。
- 单元/集成回归验证不可接受响应时请求体未读、Guide 无新增；旧路径 404、旧 resource 意图/码/令牌拒绝、Cookie/旧 Token 隔离仍覆盖。

运行代码/测试相对部署快照仅改三文件：`src/lib/mcp/http-server.ts`、`tests/mcp-http.test.ts`、`scripts/oauth-http-smoke.mjs`。保留所有前序未提交改动。

## 限制

未重新部署、未修改生产配置/数据库、未 commit/push；生产仍运行此前镜像，不包含这两项修复。本轮没有新的独立审查、精确修复版镜像构建或真实 Gemini 网页/手机验收。所有可写回归在隔离 MongoDB 中使用合成身份，没有调用真实 Gemini/R2。
