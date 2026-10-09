# 现有前端实现与 Impeccable 工作流

这是源码提取的技术快照，不是新视觉方向或 `DESIGN.md` 的替代承诺。产品事实见 `PRODUCT.md`，行为与安全契约见 `SPEC.md`。本轮不重做 UI，也没有确认创作隐喻、色彩命名或新的组件风格。

## 入口与样式来源

- 公共首页：`src/app/page.tsx` + `GuideSearch` / `GuideCard`。
- 攻略详情：`src/app/guides/[slug]/page.tsx`，逐日行程、跳转链接、来源及复制公开链接。
- 管理页面：`src/app/admin/`，共享 `GuideEditor`。
- 全局页面壳与主题入口：`src/app/layout.tsx` / `src/components/theme-toggle.tsx`。
- **样式值以 `src/app/globals.css` 为准**；以下仅用于定位现有系统，不引入第二套 token。

## 当前颜色与排版

| CSS token | 浅色 | 深色 | 当前用途 |
| --- | --- | --- | --- |
| `--ink` | `#17372e` | `#edf5f0` | 主要文字 |
| `--ink-soft` | `#36534a` | `#c2d0c9` | 次级文字 |
| `--muted` | `#62746b` | `#93a49b` | 摘要、说明 |
| `--paper` | `#f7f8f4` | `#101713` | 页面背景 |
| `--surface` | `#ffffff` | `#18231e` | 卡片、面板、输入框 |
| `--green` | `#276653` | `#83c2a8` | 主要操作与焦点 |
| `--accent` | `#ad4c32` | `#e58a69` | 目的地、时间及强调 |
| `--field-border` | `#7b9084` | `#738a7d` | 字段边界 |

- 正文使用系统无衬线字体及中文 fallback，基础 16px / 1.7 行高；不下载远程字体。
- 标题采用 `Noto Serif SC`、`Source Han Serif SC`、`Songti SC`、STSong、serif 的本地 fallback。
- 首页主标题 `clamp(2rem, 4vw, 3.25rem)`；攻略正文容器最大 880px；全站容器最大 1180px。
- 按钮最小高度 44px，搜索框 48px；面板和卡片圆角 1.2rem。状态色使用语义 token，不在组件内另设深浅主题颜色。

## 响应式与交互

- 攻略卡片桌面三列，1020px 及以下两列，540px 及以下一列；760px 及以下搜索控件纵向排列。
- 编辑器在 1020px 及以下单列，预览取消 sticky 限高；760px 及以下表单字段单列。
- 图片使用原生 img（支持管理员配置的图片域名）、lazy loading 和 async decoding；无封面卡片显示目的地。
- 搜索清空后焦点返回输入框；卡片由单一链接提供点击与键盘入口。保持跳过导航链接与焦点轮廓。
- `prefers-reduced-motion: reduce` 下关闭平滑滚动、卡片位移与图片缩放，按钮（包括主题和清空按钮）不缩放；颜色／边框反馈仍可保留。
- 右下角悬浮主题按钮仍可能遮挡部分正文，属于已记录的未解决问题，见 UI 审查报告。

## Impeccable 初始化状态

- `PRODUCT.md`：已确认的产品事实，明确区分当前能力、批准的扩展与待决定事项。
- `.impeccable/config.json`：用户选择 `buildPath: code`，新页面代码优先。
- `.impeccable/live/config.json`：仅记录 Next.js App Router 的开发期注入目标 `src/app/layout.tsx`。CSP 检测无现有策略需要修改；本轮没有启动 live、注入脚本或修改生产页面。
- 本地会话、注入 journal、临时截图不提交；共享工作流与 setup config 可以提交。不得在生产站点注入开发 helper。
- 后续若要建立正式 `DESIGN.md`，按 Impeccable document 流程确认定性设计语言；若要改版，另行确认方向，不把本次产品初始化当作改版授权。

## 修改后验证

按 `AGENTS.md` 运行测试、lint、构建和 Compose 配置检查。UI 行为用浏览器验证，明确记录模拟 viewport、模拟动态偏好、真实设备或读屏哪些未测；不能仅凭 CSS 或截图宣称全部无障碍合规。

已完成的 UI 精修及 AGY 复审记录：`docs/reviews/ui-impeccable-review.md`、`docs/reviews/agy-ui-review.txt`。

### 本轮初始化与清理验证（2026-10-09）

- `npm test`：12 个文件，81 项通过，使用独立测试 Mongo；没有外部 AI 或真实模型调用。
- `npm run typecheck` 及额外 `tsc --noEmit --noUnusedLocals --noUnusedParameters`：通过。
- `npm run lint`、`./scripts/build-with-test-env.sh`（内部执行 `npm run build`）、`docker compose config --quiet`、`git diff --check`：通过。
- Product schema 标记、web 平台、code 构建默认、live 注入目标路径及新增文档链接断言通过。
- Impeccable detector：保留的时间线与提示/警告左边框产生 3 项既有警告，已按功能含义核对；不将其当成检测无问题。
- 本轮没有改动页面交互，只删除等效的重复样式及无引用类型；没有重新做读屏、真实触屏或双端 MCP 验收。
- 清理只涉及本轮创建的测试预览和临时文件；保留历史记录、备份、静态媒体、兼容入口及构建缓存。未改生产服务或共用 MongoDB。
