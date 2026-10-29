# 2026-10-29 MCP 执行效率与稳定性优化

按用户授权提交、推送并部署 MCP 优化。仅更新 Travel Cards Web；OAuth 保持启用。部署脚本以固定提交构建镜像，对同一镜像运行隔离 OAuth/MCP smoke，验证来源后切换并检查 live/ready 健康状态。

## 发布信息

| 项目 | 实测值 |
| --- | --- |
| 应用提交 | `3f4544bc9cb5ed477a3bc4a5efc724451ac2e7dc` |
| 镜像标签 | `travel-cards:git-3f4544bc9cb5ed477a3bc4a5efc724451ac2e7dc` |
| image ID | `sha256:9f4ee1d7682a7a3eca173302a7fabb25036c55722600befb100e91d3b84b4b94` |
| 源码归档 SHA-256 | `e20db66949a7a564ccd3f6a1f9f201d7ed6452932abe34d1ba0469ac93680612` |
| OAuth | `MCP_OAUTH_ENABLED=true` |
| 容器状态 | running，RestartCount 0；live 与 ready 均通过 |

提交 `3f4544b` 已推送到 `origin/main`。镜像提交、源码归档哈希及运行容器镜像 ID 一致。

## 验证

- 本地：27 个测试文件、341 项通过；lint、TypeScript、生产构建、Compose 配置、差异检查通过。
- 固定生产镜像的隔离 `test:oauth`：REST 内容路径、双 MCP 协议、CORS、OAuth 注册/同意/PKCE/重放、权限、发布、revision 冲突、撤销及 REST 绕过拒绝通过；使用合成管理员与独立临时 MongoDB。
- 部署后只读公网检查：首页 HTTP 200、未认证 `HEAD /mcp` HTTP 401、OAuth 元数据 HTTP 200。
- Docker 元数据核对：运行镜像为上述 image ID，OAuth 仍启用；MongoDB 与 Nginx 均处于运行状态。

## 范围与未验证项

没有调用真实 Gemini 或 R2，也没有执行真实客户端工具调用。Gemini 网页/手机端耗时、确认次数与上传行为尚未重新验收。该部署不构成真实 Gemini 客户端验收结论。
