# Gemini 添加 MCP 失败：OAuth state 长度兼容

## 现场证据（仅脱敏摘要）

2026-10-10 UTC 06:48:59–06:49:30，Travel Cards 专属 Nginx access log 显示：Google HEAD `/mcp` 401；两处发现元数据 200；Google POST `/mcp` 401；OpenAuth POST `/api/oauth/register` 201；随后浏览器 GET `/api/oauth/authorize` 400。应用日志仅启动记录，无异常栈。此流程已到达应用，不是该次发现/注册被边缘拦截。

只检查失败授权请求的参数名、长度和非敏感协议字段，不保存原始查询：state 长度 1144；S256 challenge 长度 43；response_type、resource、scopes 符合当前约定，无重复字段。`src/lib/mcp/oauth-authorizations.ts` 的 state 上限 1024 会确定性拒绝这一请求并返回 invalid_request；尚未进入管理员登录/同意阶段。没有读取生产数据库或保存真实 state、client ID、完整回调标识/查询、授权码/Token。

## 最小修复

state 上限提高到 4096；仍要求非空可见 ASCII，整个编码授权查询仍限制 8192。保留客户端/回调/resource/scopes/S256 校验；state 作为不透明值精确回传，不截断、不解码内部结构，也不作为信任凭证。

使用合成 1144/4096 字符 state 验证登录恢复、同意/拒绝回调原样保留；4097 字符及编码后超过整个查询上限仍拒绝。回归先在旧实现上复现 HTTP 400，再修复至通过。本地 HTTP smoke 的三种客户端认证流程均使用合成 1144 字符 state。

## 验证与状态

267 tests、lint、隔离 production build（含 TypeScript）、Compose、OAuth/MCP HTTP smoke 全部通过；未调用真实 Gemini/R2。

修复目前仅在工作区，未提交/push/部署，未修改代理/WAF或生产凭证。需授权发布后由用户重新从 Gemini 发起添加流程；本结论只定位并修复观察到的第一处失败，后续真实授权/换码/工具握手尚未验收。
