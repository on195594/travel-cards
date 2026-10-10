# Gemini invalid_scope：注册范围与授权请求不一致

## 已验证事实

UTC 2026-10-10 06:59:04 注册返回 201，06:59:19 authorize 返回 400。脱敏授权参数请求 `guide.read guide.create guide.update guide.publish`。只读查询近期客户端记录（仅 scopes、认证方式、时间及授权状态，不查询 secret/客户端 ID/回调）显示最近两条注册 scope 都仅 `guide.read`，认证方式 client_secret_post，尚未授权。

原实现 DCR 省略 scope 时默认 guide.read，因此可能出现注册范围与发现/challenge 声明的完整可申请范围不一致。未记录注册请求体，不能断言 Google 一定省略而非显式提交只读 scope。修复覆盖省略 scope 的情况；若真实客户端显式只读注册后要求写权限，仍需其重新按正确范围注册，不能绕过注册限制。

## 用户批准的修复

仅将新 DCR 省略 scope 的默认可申请范围设为四项 AI_GUIDE_SCOPES；返回值和数据库记录一致。注册并不是授予权限。必须经过 Session 管理员明确同意、PKCE/一次性码/精确资源匹配后才签发令牌；请求和令牌仍按实际子集授权。

显式只读 scope 不扩张；空 scope、重复、未知、删除/配置权限仍拒绝；授权请求省略 scope 仍只读；既有客户端/令牌不修改，不迁移生产数据。SPEC 已更新。本次改变按用户明确授权实施。

## 验证

268 tests、lint、隔离 build/TypeScript、Compose、OAuth/MCP HTTP smoke 通过。注册测试证明默认四项范围但无 authorizedAt/authorizedScopes；集成测试验证省略注册 scope 后完整授权、按只读子集签发、未同意无令牌/授权、越界拒绝。HTTP smoke 同时覆盖省略 scope 和显式只读注册（原三种认证模式保持覆盖），使用合成身份和隔离 MongoDB。

未记录或复用真实请求 state、客户端 ID、完整回调或任何凭证。上线结果以后续发布记录为准；真实 Gemini 新注册握手仍需用户重试。
