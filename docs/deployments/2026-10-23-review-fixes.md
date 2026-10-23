# 审查修复生产发布

用户明确授权“提交并部署”。应用提交 `0dfe091` 已在本地提交，从该提交快照构建固定镜像，隔离验收后仅替换 Travel Cards Web。本轮未 push；未修改生产攻略、凭证、共享 MongoDB 或 Nginx。

## 版本与证据

| 项目 | 实测值 |
| --- | --- |
| 应用提交 | `0dfe09101e4c5d988800386d49c582c4df5b6e72` |
| 固定镜像标签 | `travel-cards:git-0dfe09101e4c5d988800386d49c582c4df5b6e72` |
| 运行 image ID | `sha256:8dcc1ff7e9bf2991e68e677b9ed57f01b6d07d0d0c75ab924a1ce02a82ee0944` |
| 源码归档 SHA-256 | `ab96d72d8577f0d56c70244b359f4f7c3cb3f9dc9fbc048cedb6806f43e12056` |
| 源码快照 | `git archive 0dfe091`，219 个文件；不含本地凭证、未提交文件、依赖及构建缓存 |
| Web 启动时间 | `2026-10-23T04:41:50.09300624Z`（北京时间 12:41） |
| 正式 MCP 入口 | `https://travel.keyi.win/mcp`，同时支持 2026-07-28 与标准 MCP 兼容模式 |
| OAuth | 保持 `MCP_OAUTH_ENABLED=true`；未轮换资源、scopes 或令牌 |

运行镜像 ID 与隔离验收镜像一致；镜像 `org.opencontainers.image.revision` 与完整应用提交一致，`win.keyi.travel-cards.source-sha256` 与 Git 归档一致。发布时直接使用镜像 ID，避免标签指向变化。

- [219 文件源码及 SHA-256 清单](./2026-10-23-review-fixes-source-manifest.json)
- [发布前状态、镜像隔离测试、部署核对及 25 项公网检查](./2026-10-23-review-fixes.json)
- [编辑器、来源时间和搜索的本地浏览器回归](../frontend.md#浏览器审查2026-10-23)

本文及同批状态文档为部署后记录，不在上述应用镜像内；后续文档提交不代表应用镜像重建。历史审查和 Gemini 用户验收保留当时含义。

## 审查修复与验证

本轮 Codex 本地审查及修复覆盖：图片 URL 每跳公网 DNS 校验、TLS 连接地址固定、IPv6/重定向/超时/流量边界，替换封面前权限检查；编辑中离开确认、缩减行程确认、保存期间继续输入保护、具体错误提示、来源本地时间/UTC 往返；搜索失败提示及重试；死代码/重复断言清理和提交快照发布。双协议支持原已在源码实现，本次提供对应运行版本证据。

- 修复提交前本地验证通过：24 个测试文件、303 项测试，lint、TypeScript/未使用符号检查、fake 环境生产构建、Compose 配置检查和隔离 HTTP/OAuth smoke。浏览器验证覆盖编辑保护、POST/PATCH 保存期间输入、两种时区、搜索故障恢复及桌面/移动视口。
- 图片下载及上传前权限使用 fake transport 回归；未将其表述为真实 R2/Gemini 成功。发布脚本的 fake Docker 测试之外，本次实际执行 `scripts/build-release.sh`，并核对归档和镜像标签。
- 实际固定镜像通过 `TRAVEL_CARDS_TEST_IMAGE=… npm run test:oauth`：生产启动环境、临时 MongoDB 与合成凭证，内容 CRUD/发布/缓存可见性、隔离数据库暂停与健康恢复，OAuth none/basic/post、PKCE/同意，MCP 2026 与标准 initialize 兼容、工具/409/403/撤销及 REST 拒绝。所有写入均在隔离数据库。
- 正式域名 25 项检查通过：首页、登录页、robots、sitemap、健康、OAuth 元数据、公开攻略列表与一篇详情、10 个前端静态资源、未认证管理列表与 MCP 拒绝、旧业务别名 404。公开列表返回 6 篇已发布攻略；元数据 resource、issuer、S256 与 challenge 已核对。
- `/api/mcp-probe` 固定数据探针通过；仅证明保留的探针可用，不代替正式业务客户端验收。
- 14 项 Compose 应用环境与替换前一致，`.env.local` 文件未变；端口仍为 `127.0.0.1:3100`，网络仍为 `meemo_backend` / `nginx-network`，代理别名保留。比较环境值时仅在内存规范化 Compose 的 `$$` 转义，不记录凭证。
- MongoDB 与 Nginx 的 container ID、image ID、StartedAt 均与预检一致；没有依赖重启、数据迁移或旧镜像删除。隔离测试容器由测试脚本清理。

本次没有新增独立外部审查；既有 AGY/Codex 独立审查的 APPROVE 不继承到本次改动。

## 发布命令

```bash
TRAVEL_CARDS_IMAGE=sha256:8dcc1ff7e9bf2991e68e677b9ed57f01b6d07d0d0c75ab924a1ce02a82ee0944 \
APP_PORT=3100 \
MEEMO_NETWORK=meemo_backend EDGE_NETWORK=nginx-network \
docker compose -p travel-cards \
  up -d --no-deps --no-build --pull never web
```

## 回滚材料（未执行）

- 原 image ID：`sha256:65c52396c46e804fa4814d41e7e4a17f1fcebd10dfc4c094a2c43ba7f836ac26`。
- 保留别名：`travel-cards:rollback-20261023-65c52396c46e`，已核对指向原镜像；原可变标签未覆盖。
- 原 OAuth=true，端口、网络、凭证均未变。本次无数据迁移。后续回滚需授权，复用上述命令（或保留的双文件命令），将 `TRAVEL_CARDS_IMAGE` 改为原 image ID，再核对健康与公开鉴权。
- 原镜像缺少 revision、源码 SHA 为 `unknown`；它可恢复替换前运行状态，但不是已修复版本的安全保证。

## 剩余验证

真实 Gemini 网页/手机对当前双协议版本尚未重新验收；图片上传、发布确认、冲突与撤销需实际客户端验证。本次没有调用真实 Gemini/R2、签发生产测试授权或写入生产攻略，也未执行生产恢复及真实手机测试。
