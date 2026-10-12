# 详情页全章节导航优化与文档对齐发布

用户明确授权提交、push、部署。应用提交 `587df41221766579dd120c93c4e34190fa770c6a` 已推送 origin/main 并部署。

- 范围：详情页跳转导航简洁化优化，去除“·”后缀详情文本，胶囊仅保留“第 X 天”与板块名称（如“交通出行”），完整标题移至 `title` 悬停提示；全章节快速跳转导航与样式；文档对齐（SPEC.md 4.2、PRODUCT.md、README.md、frontend.md 等对齐双端验收与新能力契约）。
- 从该提交的 git archive 构建固定镜像，不混入 dirty 工作树、.env.local 或备份。
- 镜像：`travel-cards-web:commit-587df4122176`。
- Image ID：`sha256:58e77b538c1674768ccc3b287b6537a07f4e95705858fe8e1ba27d67aa5b8370`。
- 源码归档 SHA-256：`76af694367bfb6798e3d289e8993c3fc72b5c3ac173a20f62924eec8cf314d34`；镜像记录源码 hash 及完整 revision。
- 原镜像：`travel-cards-web:commit-d26043969981`（ID `sha256:50a7b93e9f51f7c3bad9c102876a14e20d303a34165e6510a738238b957c3af6`），保留未删除。
- OAuth 继续为 true，只替换 Web，不改变凭证、共用 MongoDB、代理或其他项目。

```bash
TRAVEL_CARDS_IMAGE=travel-cards-web:commit-587df4122176 MCP_OAUTH_ENABLED=true \
  docker compose -f docker-compose.yml -f docker-compose.production.yml \
  up -d --no-deps --no-build --pull never web
```

## 验证

- 部署前运行全量验证（21 文件、283 项测试、lint、typecheck、recovery smoke、OAuth smoke）通过；Compose 配置与 diff whitespace 检查通过。
- 固定快照镜像生产构建与 TypeScript 检查通过。
- 本地 live/ready 通过；公网首页、live/ready、已发布攻略详情均 200。
- 详情页跳转导航实测输出包含逐日小标题、各专题小节（交通出行、住宿推荐、餐饮美食、实用建议、安全防范）以及对应锚点 ID。
- 运行容器 image/revision 与应用提交完全一致。

本文属于部署后记录提交，镜像对应应用提交 b0daf2b，不包含该记录提交。回滚需要授权，使用相同生产 Compose 命令改为原镜像并保持 OAuth=true；本轮未执行回滚。
