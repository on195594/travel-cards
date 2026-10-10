# Gemini DCR 默认 scope 修复发布

用户明确批准修复、提交、push、部署。提交 `985b86ad9fcb8ccde203eb43b44ee5fa6a2cbb47` 已推送 origin/main 并部署生产。

## 行为与版本

新注册省略 scope 时，可申请范围默认为 `guide.read guide.create guide.update guide.publish`；注册本身不授权，仍需管理员明确同意。显式只读、旧注册与已有令牌均不扩大权限；空/未知 scope 拒绝。授权请求省略 scope 仍只读。用户需从 Gemini 重新添加以产生新注册，不能复用失败的旧授权页。

- 镜像 `travel-cards-web:commit-985b86ad9fcb`。
- Image ID `sha256:f0ac2312f24344e3257b1bffb687b84425b01ed0cfe96a7b024c9411cd8ad17d`。
- 从精确提交 git archive 构建；源清单 SHA-256 `c2b387fbcfc613bf6690d54e97cc2cfc667e3f36025a5c383fe97f73f22f522e`。
- 268 tests、lint、build/TypeScript、Compose、本地及精确镜像 OAuth/MCP HTTP smoke 通过。省略注册 scope + 完整授权、显式只读注册、注册不授权、越界 scope 拒绝、管理员 CRUD 均有覆盖。可写验证均在隔离 MongoDB 中使用合成身份。

## 生产验证

校验旧容器、精确镜像/源码和环境配置无变化后，仅替换 Web；开关 true 不变。公开/未授权 smoke 通过：首页、登录、健康和 metadata 200；MCP 401 + 正确 challenge；旧路径 404；管理员 REST 无身份 401。实际运行 Image ID 已核对，没有生产注册/签发/业务写入、迁移旧注册或修改凭证，也未改共用 MongoDB/Nginx/WAF。

[preflight](./2026-10-10-gemini-scope-preflight.json) · [smoke](./2026-10-10-gemini-scope-smoke.json)

```bash
set -euo pipefail
TRAVEL_CARDS_IMAGE=travel-cards-web:commit-985b86ad9fcb MCP_OAUTH_ENABLED=true \
  docker compose -f docker-compose.yml -f docker-compose.production.yml \
  up -d --no-deps --no-build --pull never web
```

旧镜像 `travel-cards-web:commit-097e54b3e43e` 保留，需回滚时经操作授权使用相同命令改为旧镜像，开关仍 true。本次 smoke 失败恢复保护未触发，未执行回滚。本文为部署后文档提交，应用镜像对应功能提交 985b86a。

## 尚未验证

真实 Google 注册请求体未保存，无法断言其 scope 是省略还是显式只读。本修复仅覆盖省略的情况；若客户端显式只读注册仍申请四项 scope，将继续安全拒绝。需要用户重新添加 `https://travel.keyi.win/mcp` 并完成同意，后续真实授权/换码/工具调用仍待验收。没有新的独立 AGY/Codex 审查，不将历史审批扩展为本次证明。
