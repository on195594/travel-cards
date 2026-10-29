# 现有前端实现与 Impeccable 工作流

这是从源码提取的技术快照，不是新视觉方向或 `DESIGN.md` 的替代承诺。产品事实见 `PRODUCT.md`，行为与安全契约见 `SPEC.md`。公开页面沿用现有视觉系统做局部优化，不引入新的创作隐喻、色彩命名或组件体系。

## 入口与样式来源

- 公共首页：`src/app/page.tsx` + `GuideSearch` / `GuideCard`。
- 攻略详情：`src/app/guides/[slug]/page.tsx`，逐日行程、跳转链接、路线文件与资料附件（GPX/KML/PDF）下载面板、来源及复制公开链接。
- 管理页面：`src/app/admin/`，共享 `GuideEditor`（含封面上传、行程编排与附件管理）。
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
- 图片使用原生 img（支持管理员配置的图片域名）与 async decoding；有 `variants` 元数据的新封面使用 `srcset` / `sizes`，按卡片列宽和详情宽度选择 480/960/1600px 目标宽度的 WebP，最长边不超过 1600px；旧封面仍使用原图。首页第一张卡片使用 eager / high priority，其余 lazy；无封面卡片显示目的地。详情封面预留 16:9、手机 4:3 的展示区域，contain 保留完整图片，提供原图链接。
- 搜索清空后焦点返回输入框；卡片由单一链接提供点击与键盘入口。保持跳过导航链接与焦点轮廓。
- `prefers-reduced-motion: reduce` 下关闭平滑滚动、卡片位移与图片缩放，按钮（包括主题和清空按钮）不缩放；颜色／边框反馈仍可保留。
- 附件下载面板：在详情页来源区域前提供路线与资料下载面板，包含格式徽章（GPX/KML/PDF）、名称、大小、说明及安全下载链接；手机视口纵向整齐堆叠，下载按钮最小触摸高度 44px。
- 右下角悬浮主题按钮仍可能遮挡部分正文，属于已知未解决问题。

## 已实现的交互约定

- OAuth 页面：`/admin/oauth/consent` 显示客户端名称、精确回调与 scopes，原生表单同意／拒绝；`/admin/oauth` 列出客户端并可撤销。页面 metadata 用 `same-origin` referrer，服务端拒绝缺失或 `null` Origin；登录 returnTo 只允许本站 authorize/consent。
- 搜索：服务端按 `q` 直出首屏结果；输入停顿 250ms 后远端查询，清空或改词取消旧请求，过期响应不回写；查询中、失败（可重新搜索）、无结果分别展示。
- 详情：正文行高 1.85、最长 65ch；天数与板块胶囊跳转，语义锚点带 `scroll-margin-top` 与 `:target` 高亮；提示／警告用全包围边框（无 side-tab）；底部“回到行程顶部”。
- 编辑器：按 `day` 匹配行程，缩短已填写行程先确认；`beforeunload` 保护未保存修改；首次保存只更新 URL、不重建编辑器；服务端 `issues` 按字段显示并以 `role="alert"` 通知；`datetime-local` 按本地时间显示、以 UTC ISO 提交。
- 图片上传生成 480/960/1600px WebP `variants`，旧图片无 variants 时用原图。

## Impeccable 初始化状态

- `PRODUCT.md`：已确认的产品事实，明确区分当前能力、批准的扩展与待决定事项。
- `.impeccable/config.json`：用户选择 `buildPath: code`，新页面代码优先。
- `.impeccable/live/config.json`：仅记录 Next.js App Router 的开发期注入目标 `src/app/layout.tsx`。CSP 检测无现有策略需要修改；本轮没有启动 live、注入脚本或修改生产页面。
- 本地会话、注入 journal、临时截图不提交；共享工作流与 setup config 可以提交。不得在生产站点注入开发 helper。
- 后续若要建立正式 `DESIGN.md`，按 Impeccable document 流程确认定性设计语言；若要改版，另行确认方向，不把本次产品初始化当作改版授权。

## 修改后验证

按 `AGENTS.md` 的范围选检查。UI 改动用浏览器走一遍受影响页面（手机 390px + 桌面 1440px，明暗主题）；说明哪些未测（真实设备、读屏）。历次验证记录见 git 历史。
