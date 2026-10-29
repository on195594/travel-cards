# 项目目录与文档导航

## 文档

| 文件 | 用途 |
| --- | --- |
| [../README.md](../README.md) | 当前状态、运行、部署、验证入口 |
| [../SPEC.md](../SPEC.md) | 产品行为、数据结构与权限的权威契约 |
| [../PRODUCT.md](../PRODUCT.md) | 已确认的定位与能力 |
| [../AGENTS.md](../AGENTS.md) | 实施与验证约束 |
| [frontend.md](./frontend.md) | 现有 UI 技术事实与 Impeccable 工作流 |
| [backup-restore.md](./backup-restore.md) | 数据／图片恢复边界与共享 MongoDB 所有权 |
| [decisions/](./decisions/) | 项目根目录、MCP/OAuth 认证、2026 协议迁移等决定 |
| [roadmaps/ai-client-integration.md](./roadmaps/ai-client-integration.md) | 外部 AI 接入的边界、Gemini 限制与下一步 |
| [gemini-oauth-troubleshooting.md](./gemini-oauth-troubleshooting.md) | Gemini 添加 MCP 时的 OAuth/CORS 排障记录 |

历史发布记录、审查原文与清理记录已于 2026-10-29 从工作树移除，需要时用 `git log -- docs/deployments docs/reviews docs/maintenance` 查找。

## 源码和运行目录

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 页面与 Route Handlers；`/api/*` 为 REST，`/mcp` 为正式 MCP 入口 |
| `src/components/` | 公开卡片、搜索、攻略编辑器等共享 UI |
| `src/lib/guides/` | schema / repository / service；`src/lib/guides.ts` 为统一导出 |
| `src/lib/mcp/` | 工具、HTTP 适配、OAuth 客户端、授权码及令牌 |
| `src/lib/ai/`、`src/lib/storage/` | Gemini 候选助手；图片与附件上传、下载、响应式 WebP |
| `tests/`、`scripts/` | 测试、隔离 MongoDB、HTTP smoke、恢复演练、发布与运维脚本 |
| `public/` | 静态资源；无 import 引用不代表可删（如 `travel-hero.webp` 仍有外部访问） |
| `.impeccable/` | 代码优先构建配置 |
| `.hermes/plans/` | 历史计划，不是当前待办权威 |
| `tmp/`、`backups/` | 忽略的短期工作区与本地恢复材料 |
| `.env.local` | 本地凭证；不提交 |
