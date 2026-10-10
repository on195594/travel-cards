# Gemini OAuth state 兼容修复发布

用户明确授权提交、push、上线。修复提交 `097e54b3e43e8ce5ef8c1f97bf29bbba72cc85a9` 已推送 origin/main，生产已更新。

- 修复：state 上限 1024 → 4096；整条编码授权查询上限仍为 8192，鉴权/回调/resource/scopes/PKCE 不变。
- 镜像：`travel-cards-web:commit-097e54b3e43e`。
- Image ID：`sha256:a7f16f1aeebc138db0867cea4b3e91d1fe48a0021c0b6cf6c783c69df7fdf12c`。
- 从该提交 git archive 构建，源码清单 SHA-256 `af2a32b61eeba632486fa678b851b652052969e03c34603f539851c9a4bb8932`；镜像标记 commit 和源码 SHA。
- 267 tests、lint、构建/TypeScript、Compose 通过；精确镜像通过隔离 OAuth/MCP 与管理员 CRUD HTTP 回归，三种客户端认证均使用合成 1144 字符 state。
- 部署前校验旧容器、源码和镜像标签、环境配置完全不变（规范化 Compose literal-dollar 转义）。仅替换 Web，没有改生产凭证、Nginx/WAF、共用 MongoDB 或其他项目。

生产 smoke：首页/登录/健康/发现正常，`/mcp` 401 challenge 正确、旧路径 404、管理端无身份 401。使用合成且未注册的客户端 GET authorize：1144/4096 字符 state 已通过参数校验进入 invalid_client；4097 字符仍 invalid_request。没有注册生产测试客户端、签发令牌或写攻略，也没有重放用户真实授权参数。完整授权闭环证据来自隔离环境；真实 Gemini 重试仍需用户操作。

[preflight](./2026-10-10-gemini-state-preflight.json) · [production smoke](./2026-10-10-gemini-state-smoke.json)

旧镜像 `travel-cards-web:commit-534d4ac931457` 保留。smoke 失败时配置了自动恢复旧 Web，本次全部通过，未执行回滚。

发布命令：

```bash
set -euo pipefail
TRAVEL_CARDS_IMAGE=travel-cards-web:commit-097e54b3e43e MCP_OAUTH_ENABLED=true \
  docker compose -f docker-compose.yml -f docker-compose.production.yml \
  up -d --no-deps --no-build --pull never web
```

需要回滚时，经操作授权使用相同命令并将镜像替换为旧镜像，开关保持 true。本文是部署后文档提交，应用镜像对应修复提交 097e54b，不含随后的文档提交。用户应重新从 Gemini 添加 `https://travel.keyi.win/mcp`，不要复用先前失败的授权页；后续真实握手是否存在其他兼容问题仍未验收。
