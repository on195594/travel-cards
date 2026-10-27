# 项目目录与文档导航

## 从哪里开始

1. [根 README](../README.md)：运行、验证、接口入口与发布边界。
2. [SPEC](../SPEC.md)：产品行为、数据结构与服务端权限的权威契约。
3. [PRODUCT](../PRODUCT.md)：已确认的定位、用户和能力；不将计划写成已实现。
4. [AGENTS](../AGENTS.md)：本项目的实施与验证约束。
5. [历史审查与清理](./maintenance/2026-10-21-review-cleanup.md)：2026-10-21 的问题、清理清单、验证与未覆盖范围；最新运行状态和清理范围见根 README。
6. [MCP 协议决定](./decisions/2026-10-21-mcp-2026-migration.md)：2026 协议及 10-22 双协议兼容补充、限流和隔离验证；双协议已随 `0dfe091` 部署，真实客户端尚未重新验收。
7. [性能优化审查与修复](./reviews/2026-10-23-performance-agy.md)：2026-10-23 响应式 WebP、首屏搜索 SSR 与 MCP 请求路径优化及真实 AGY 静态审查（318 项测试全过）。
8. [Gemini MCP OAuth 连接踩坑记录](./reviews/2026-10-23-gemini-oauth-handshake-troubleshooting.md)：2026-10-23 修复 Gemini Origin 跨来源 403 阻断、CORS 响应头补齐、OPTIONS 预检、Token 端点 resource/scope 宽容度及同意跳转加固。

## 源码和运行目录

| 路径 | 职责与整理边界 |
| --- | --- |
| `src/app/` | Next.js 页面与 Route Handlers；`/api/*` 为 REST，`/mcp` 为正式 MCP 入口 |
| `src/components/` | 公开卡片、搜索、攻略编辑器等共享 UI |
| `src/lib/guides/` | schema / repository / service；`src/lib/guides.ts` 是仍被调用的统一导出 |
| `src/lib/mcp/` | 工具、HTTP 适配、OAuth 客户端、授权码及令牌；不能仅按静态 import 数删除 |
| `src/lib/ai/`、`src/lib/storage/` | 服务端 Gemini 候选助手、公网图片下载边界、响应式 WebP 衍生尺寸与 R2 上传 |
| `tests/`、`scripts/` | 单测、集成、浏览器回归、隔离 MongoDB、REST/OAuth/MCP HTTP smoke、合成恢复演练、提交快照镜像构建/发布及密码生成；新增发布失败回归使用 fake Docker |
| `public/` | 现有静态资源；不能因无 TypeScript import 删除 |
| 根配置文件 | Next.js、TypeScript、Vitest、ESLint、Docker/Compose 与依赖锁定；保留工具约定位置 |
| `.impeccable/` | 已确认的代码优先构建配置；live setup 不代表实际启用 |
| `.hermes/plans/` | 历史计划与审查上下文，不是当前运行时或待办权威；本轮保留原路径 |
| `tmp/` | 忽略的短期工作区；旧批次已校验归档并清空，不存唯一正式证据 |
| `backups/` | 忽略的本地恢复材料；旧发布脚本归档在 `cleanup-2026-10-23/legacy-deploy.tar.gz`，保留旧备份 |
| `.next/`、`node_modules/`、`tsconfig.tsbuildinfo` | 忽略的构建/依赖产物；不作为源码或临时证据清理 |
| `.env.local` | 本地凭证；不读取内容、不移动、不提交 |

2026-10-27 目录核对：沿用上述分层，修正脚本职责和当前证据入口；`tmp/` 为空，未发现可确认删除的生产 TS/TSX 或 CSS 死代码。旧首页 `public/travel-hero.webp` 已无源码引用，但有历史访问记录，保留公开 URL 与目录兼容性；不删除备份或搬动历史审查证据。

## 文档分层

| 目录/文件 | 用途 |
| --- | --- |
| [frontend.md](./frontend.md) | 现有 UI 技术事实、样式来源和历次本地验证，不是重做视觉系统的授权 |
| [backup-restore.md](./backup-restore.md) | 数据/图片恢复边界、共享 MongoDB 所有权与隔离演练 |
| [decisions/](./decisions/) | 项目根目录、MCP/OAuth 等已记录决定 |
| [roadmaps/ai-client-integration.md](./roadmaps/ai-client-integration.md) | AI 接入的当前实现、用户验收、限制与下一步 |
| [roadmaps/2026-09-18-architecture-evolution.md](./roadmaps/2026-09-18-architecture-evolution.md) | 带历史基线的阶段路线图；其“当前”指当时快照，不覆盖现行 SPEC |
| [reviews/](./reviews/) | 只覆盖当时范围的审查原文、补丁、清单与裁决；不重写历史结论 |
| [deployments/](./deployments/) | 固定镜像、回滚与 smoke 的历史证据；不自动证明现在线上版本 |
| [maintenance/](./maintenance/) | 日期化审查、文档对齐与清理记录 |

## 状态与证据怎么读

- 代码实现、本地测试、历史上线、真实 Gemini 用户验收分别记录，互不替代。
- 2026-10-27 当前可溯源发布为 `feb9d02`，运行镜像 ID、revision 与源码归档 SHA 一致，详见 [README](../README.md#当前状态)。[0dfe091 发布记录](./deployments/2026-10-23-review-fixes.md)与 `80a2b8a` 等记录仅覆盖历史版本。
- 当前发布包含性能优化；该优化批次曾有 25 个测试文件、318 项测试及真实 AGY 审查 APPROVE。后续审查基线为 23 个文件、307 项；本轮修复后为 24 个文件、325 项，主机/Docker 默认构建、正式镜像 OAuth smoke 及隔离恢复通过。修复与依赖升级已发布，见[上线记录](./deployments/2026-10-27-maintenance-release.md)，不继承历史审查覆盖范围。
- 历史 `pending`、`NOT_RUN`、`APPROVE` 只表示当时批次；[2026-10-12 用户确认](./roadmaps/ai-client-integration.md#真实双端验收用户确认)仅覆盖历史协议。2026 协议迁移已部署，仍待真实客户端验收，不推定图片上传等专项通过。
- 临时源码快照若不完全存在于 Git 历史，先保留可恢复归档，不能把源码清单的哈希当作源码备份。
