# UI、性能复审及 MCP 图片能力发布

用户明确授权提交、push、部署。本次发布应用提交 `225b405e91c611928e1f444cf43788126fbff96f`，已推送 origin/main。

## 发布范围

包含此前未提交的 MCP 图片工具与 scope、长效授权、公开 UI 精修及性能复审修复。保留即时读取策略，撤回重复 Mongoose 初始化缓存和固定高度离屏渲染。性能提示不代表已取得线上 LCP 收益。

## 镜像与部署

- 由 `git archive` 的纯提交快照构建，无本地凭证或工作区文件混入。
- 镜像：`travel-cards-web:commit-225b405e91c6`。
- Image ID：`sha256:927b05f244a3b9c72a944ce571dd2f9a0028cbde2ba16845c0b74f18fba671b2`。
- 源码归档 SHA-256：`5c61f70bf2363635b96e94b383d50b73b0fac6a1d602fb5f4c094b52247b3a0e`，与镜像源码标签对应。
- 原镜像 ID：`sha256:a3989fb672b1b0df24a223e16e0923c048617db1f9eaea6ca1042348f5422d25`，未删除。
- OAuth 开关保持 `true`；未改凭证、共用 MongoDB、Nginx 或其他项目。

```bash
TRAVEL_CARDS_IMAGE=travel-cards-web:commit-225b405e91c6 MCP_OAUTH_ENABLED=true \
  docker compose -f docker-compose.yml -f docker-compose.production.yml \
  up -d --no-deps --no-build --pull never web
```

## 验证

- 提交前重新运行 277 项测试及 lint，全部通过；Compose 配置、diff whitespace 检查通过。
- 固定源码镜像的 Next.js 生产构建与 TypeScript 检查通过。
- 本地 live/ready 均通过；公网首页、登录页、live/ready、OAuth 两类 metadata 均为 200。
- 无凭证 `/mcp` 返回 401，challenge 包含 `image.upload`。
- 已核对运行容器的镜像标签及完整 revision 与应用提交一致。
- 未做真实 Gemini 授权、R2 上传、压力测试或线上 Core Web Vitals 测量；本次 smoke 不写生产内容。

本文为部署后记录，镜像对应应用提交 225b405，不含此记录提交。回滚需经授权，使用上述生产 Compose 命令指定原镜像 ID 并保持 OAuth 开关；本轮没有执行回滚。
