# 文档对齐与清理发布

用户明确授权提交、push、部署。应用提交 `d260439699811c207d22055396dba67d5112fee4` 已推送 origin/main 并部署。

- 范围：当前文档对齐、授权期限准确文案、删除搜索输入的无逻辑包装、测试标题修正。临时文件清理是本地操作，不改变镜像业务功能。
- 从该提交的 git archive 构建固定镜像，不混入 dirty 工作树、.env.local 或备份。
- 镜像：`travel-cards-web:commit-d26043969981`。
- Image ID：`sha256:50a7b93e9f51f7c3bad9c102876a14e20d303a34165e6510a738238b957c3af6`。
- 源码归档 SHA-256：`814855f94d608256036c372544fc92c2f2e1bbdb2ce32376058be12089b4f504`；镜像记录源码 hash 及完整 revision。
- 原镜像：`travel-cards-web:commit-225b405e91c6`（ID `sha256:927b05f244a3b9c72a944ce571dd2f9a0028cbde2ba16845c0b74f18fba671b2`），保留未删除。
- OAuth 继续为 true，只替换 Web，不改变凭证、共用 MongoDB、代理或其他项目。

```bash
TRAVEL_CARDS_IMAGE=travel-cards-web:commit-d26043969981 MCP_OAUTH_ENABLED=true \
  docker compose -f docker-compose.yml -f docker-compose.production.yml \
  up -d --no-deps --no-build --pull never web
```

## 验证

- 部署前重新运行 277 项测试及 lint，通过；Compose 配置与 diff whitespace 检查通过。
- 固定快照镜像生产构建与 TypeScript 检查通过。
- 本地 live/ready 通过；公网首页、登录、live/ready、两类 OAuth metadata、已发布攻略详情均 200。
- `/mcp` 无凭证为 401，challenge 包含 image.upload；旧 `/api/mcp` 为 404。
- 运行容器 image/revision 与应用提交完全一致。
- 未签发生产测试令牌或写生产内容，未重跑真实 Gemini/R2、浏览器矩阵或性能压测。

本文及当前文档入口更新属于部署后记录提交，镜像对应应用提交 d260439，不包含该记录提交。已知图片 URL 拉取 DNS 层 SSRF 防护缺口未在本轮修复，仍见接入路线图。回滚需要授权，使用相同生产 Compose 命令改为原镜像并保持 OAuth=true；本轮未执行回滚。
