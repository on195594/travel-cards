# Gemini MCP OAuth 连接失败排查与修复踩坑记录

- 日期：2026-10-23
- 关联提交：`6a5f28d` (`fix(oauth): support Gemini origin, allow optional resource in token exchange, and harden consent redirect`)
- 镜像版本：`travel-cards:git-6a5f28d045ff1e13ffe6340a24279bba05656fb2`

---

## 一、现象与报错特征

### 客户端现象
在 Google Gemini Web/Mobile 应用中添加或重新连接自定义 MCP 服务端（`https://travel.keyi.win/mcp`）时，经历登录并点击“同意并连接”后，页面最终跳回 Gemini 界面，弹窗出现红色报错：
> **`Account linking is required to use this custom app. Try again.`**

### 服务端访问日志轨迹（以 UTC 11:31、12:07、12:22 为例）
1. Google 探测阶段：`HEAD /mcp` 返回 401，`GET /.well-known/*` 返回 200，正常通过。
2. 动态客户端注册（DCR）：`POST /api/oauth/register` 返回 201，客户端成功注册。
3. 用户授权与同意：
   - 手机浏览器 `GET /api/oauth/authorize` 返回 303 跳转同意页。
   - 同意页 `GET /admin/oauth/consent` 返回 200。
   - 用户点击“同意并连接”，`POST /api/oauth/consent` 返回 303 重定向到 Google 中继：
     `https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-...`
   - 服务端在 3 秒内将授权码成功存入 MongoDB（有效期 5 分钟），记录审计日志 `mcp.client.authorize`。
4. **中断点**：
   重定向之后，Google 官方后端**从未向我们的服务端发起 `POST /api/oauth/token` 换码请求**。授权码静默等待 5 分钟后在数据库过期，Gemini 侧因为未取得 Token 判定账号关联失败。

---

## 二、排查过程与踩坑复盘

### 踩坑点 1：误判 Cloudflare 边缘阻断
- **初判假说**：由于 Nginx 访问日志里完全没有收到来自 Google 的 `POST /api/oauth/token` 请求，起初推测是 Google 数据中心发起的表单 POST 请求在 Cloudflare 边缘被 Bot Fight Mode 拦截（社区案例如 Trek Issue #1667 曾出现类似情况）。
- **推翻依据**：经用户提示“该问题此前也出现过，后来定位是代码问题”，再次深入官方社区与源码排查，发现同为 Google 后端发起的 `POST /api/oauth/register` 每次都能稳定穿透 Cloudflare 并到达 Nginx（201）。更深层次的代码审查揭示了应用层存在数个阻断浏览器关联流程的致命缺陷。

### 踩坑点 2：硬编码拒绝了 `https://gemini.google.com` 跨来源（核心致命 Bug）
- **原代码缺陷**：
  在 `src/lib/mcp/http-server.ts` 的 `authenticate` 函数中：
  ```typescript
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(getMcpResource()).origin) {
    throw new HttpError(403, "CROSS_ORIGIN", "拒绝跨来源 MCP 请求");
  }
  ```
- **实际后果**：
  原代码仅允许同源（`https://travel.keyi.win`）。当用户在 `gemini.google.com` 界面添加/测试工具时，浏览器发出的探测与跨域请求携带 `Origin: https://gemini.google.com`，被服务端直接返回 `403 Forbidden Origin`！OPTIONS 预检亦被 403 阻断，浏览器甚至无法读取 401 响应中的 `WWW-Authenticate` 挑战头。

### 踩坑点 3：OAuth 与 MCP 路由缺失 CORS 支持
- 客户端在 `gemini.google.com` 页面上下文执行时，需跨域读取 `/.well-known/oauth-protected-resource/mcp` 与 `/.well-known/oauth-authorization-server`。
- 原实现没有设置 `Access-Control-Allow-Origin`，也没有处理浏览器的 `OPTIONS` 预检请求（导致预检返回 403/405），阻断了 Gemini 前端完成关联检测。

### 踩坑点 4：`/api/oauth/token` 对参数校验过于严苛
- 原 `src/app/api/oauth/token/route.ts` 的 Zod 输入 Schema 中：
  - `resource` 被定义为必填项（无 `.optional()`）；
  - 使用了 `.strict()` 拒绝任何额外字段。
- 根据 RFC 8707 第 2 节，单资源授权时客户端在换码阶段**可以省略 resource 参数**；此外部分客户端会自动附带可选的 `scope`。原实现的强行必填与 `.strict()` 存在误杀换码请求的风险。

### 踩坑点 5：表单 POST 303 重定向在移动端 WebKit 的多跳截断
- 用户在 `src/app/admin/oauth/consent/page.tsx` 中通过原生 `<form method="post" action="/api/oauth/consent">` 提交授权。
- 接口直接返回 303 到 Google 中继 `oauth-redirect.googleusercontent.com`，Google 中继再内部跳转回 `gemini.google.com`。
- Chrome / iOS WebKit 针对表单 POST 触发的跨域多跳重定向链存在严格的导航与安全限制，易在第二跳发生状态截断或导航取消。在返回 303 头部时补充 HTML 页面级的 `<meta http-equiv="refresh">` 与 `window.location.replace` 兜底，能确保浏览器执行干净的顶层 GET 导航。

---

## 三、代码修复方案

1. **新增集中式 CORS 模块** (`src/lib/mcp/cors.ts`)：
   - 明确放行同源、`https://gemini.google.com` 以及可选环境变量 `MCP_ALLOWED_ORIGINS`。
   - 暴露 `WWW-Authenticate`、`MCP-Protocol-Version` 响应头，规范配置 `Access-Control-Allow-Methods` 与缓存时效。
2. **MCP 服务端放行与预检** (`src/lib/mcp/http-server.ts`)：
   - `authenticate` 校验放行 `mcpAllowedOrigins`。
   - `mcpPost` 与错误响应中一律注入 CORS 响应头。
   - 支持 `OPTIONS /mcp` 返回 HTTP 204 No Content 预检通过。
3. **OAuth Token 端点宽容度加固** (`src/app/api/oauth/token/route.ts` & `src/lib/mcp/oauth-authorizations.ts`)：
   - 允许 `resource` 和 `scope` 可选；若省略 `resource`，自动缺省回退到当前 MCP 规范资源（`getMcpResource()`）。
   - 增加 `OPTIONS` 204 预检支持。
4. **元数据发现端点 CORS 补齐** (`src/app/.well-known/*`)：
   - 补充 `GET` 下的 CORS 头与 `OPTIONS` 204 预检。
5. **同意跳转加固** (`src/lib/mcp/oauth-http.ts`)：
   - `oauthRedirect` 在返回 303 Location 的同时输出轻量 HTML 中转体（带 meta refresh 与 JS replace），打断表单 POST 链条。

---

## 四、验证与上线记录

1. **本地回归测试**：
   - 23 个测试套件、307 项测试全部通过（`tests/mcp-http.test.ts`、`tests/mcp-oauth-flow.test.ts`）。
   - 针对性增加了：Gemini Origin 跨域请求、OPTIONS 预检、Token 省略 resource 换码、Token 带 scope 换码等测试用例。
   - ESLint、TypeScript 类型检查、生产构建全部通过。
2. **Git 提交与发布**：
   - 提交哈希：`6a5f28d`，推送至 GitHub `origin/main`。
   - 镜像标签：`travel-cards:git-6a5f28d045ff1e13ffe6340a24279bba05656fb2`。
   - 生产容器 `travel-cards-web-1` 启动就绪，健康端点正常。
3. **公网线上探测核验**：
   - `OPTIONS https://travel.keyi.win/mcp` 带 Gemini Origin：返回 **HTTP 204**，带完整 CORS 头。
   - `HEAD https://travel.keyi.win/mcp` 带 Gemini Origin：返回 **HTTP 401**，正确挑战并携带 `WWW-Authenticate` 与 CORS 头。
   - `GET https://travel.keyi.win/.well-known/oauth-authorization-server` 带 Gemini Origin：返回 **HTTP 200** 与 CORS 头。
