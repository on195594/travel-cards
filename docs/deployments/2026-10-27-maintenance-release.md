# 2026-10-27 审查修复与安全依赖发布

用户授权“继续帮我推进上线”后，已提交审查修复、升级现有依赖，从明确提交构建固定镜像并仅替换 Travel Cards Web。北京时间 09:51 上线，源站与公网各 28 项检查通过。未 push、修改生产攻略或凭证；MongoDB、Nginx 的容器 ID、镜像及启动时间保持不变。

## 版本与证据

| 项目 | 实测值 |
| --- | --- |
| 应用提交 | `feb9d02768402e1fe16d3719d076b296d2836240` |
| 镜像标签 | `travel-cards:git-feb9d02768402e1fe16d3719d076b296d2836240` |
| image ID | `sha256:918dcc4c9a8c2565d2eff44875159de97458a255f256029da16c5ed60a60936d` |
| 源码归档 SHA-256 | `08ce5f363b395282e04b7e172f355556e57c034c41c2bcb426d7d250b3d1e414` |
| Web StartedAt | `2026-10-27T01:51:36.22907088Z` |
| OAuth | `MCP_OAUTH_ENABLED=true`，沿用原有授权、令牌和 scopes |
| 运行配置 | `127.0.0.1:3100`，`meemo_backend` / `nginx-network`，代理别名 `travel-cards-web`；json-file 日志轮转 50m × 3 |

- [源码文件与 SHA-256 清单](./2026-10-27-maintenance-release-source-manifest.json)
- [运行基线、检查与限制的结构化记录](./2026-10-27-maintenance-release.json)

镜像 revision、归档 SHA、隔离测试 image ID 和最终运行 image ID 均一致。本文及同步状态文档为部署后记录，不在上述应用镜像内；后续文档提交不意味着重新部署。

## 变更与验收

- 编辑器按实际 `day` 保留稀疏/乱序行程；缩短已填写天数先确认，取消与未修改失焦保留原内容。
- 两种 MCP 协议的未知工具、权限、限流及基础设施错误响应保留允许来源 CORS，暴露授权挑战与 Retry-After，权限语义不变。
- 恢复 OAuth/MCP HTTP smoke 与合成恢复演练；发布脚本固定镜像 ID、验证源码来源、保存原配置并在失败后回滚核验健康。上线复核发现并修正空 `IPAMConfig: {}` 的误拒绝，显式静态地址仍拒绝。独立只读复核确认该阻塞消除；未新增 AGY 审查，也不继承历史 APPROVE。
- Next.js / eslint-config-next 升至 16.4.3，Zod 4.6.7、Vitest 4.1.12，锁定 Vite 8.3.5；当次 `npm audit` 已知漏洞 0。Next.js 升级覆盖 [Server Actions DoS 公告](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r)，Zod 修补见[上游变更](https://github.com/colinhacks/zod/pull/6652)。不将审计 0 解读为不存在未知风险。
- 24 个测试文件、325 项通过（含 12 项 fake 发布失败/回滚回归）；lint、typecheck、默认主机生产构建、Dockerfile 默认构建、Compose、差异检查通过。主机此前 Turbopack EPERM 在本次升级后未复现。
- 正式镜像通过隔离 `test:oauth`：REST CRUD/发布、HTML/RSC 可见性、双协议、PKCE/重放、none/basic/post、scope、409、403、撤销、CORS 与数据库故障恢复。仅合成账号和独立 MongoDB。
- `test:recovery` 恢复两篇合成攻略、4 个索引及 68 字节图片；校验和、损坏检测和 sentinel 不变通过，非生产恢复演练。
- 同一正式镜像的 Chromium 验证：错误密码拒绝、正确登录、稀疏行程扩展/取消/确认、保存重载、退出后后台重定向；编辑器/首页/详情 390 与 1440px 无横向溢出。测试定位器按已发布攻略实际保存按钮修正后完成，不改变应用行为。
- 源站、公网分别 28 项检查：首页、登录、六篇详情、公开列表、sitemap、10 个静态资源、健康、OAuth 元数据、未认证管理/MCP 拒绝、允许来源预检、旧路径 404。六篇公开攻略响应 SHA-256 在切换前后完全一致。
- Compose 应用环境值在内存中与原运行配置逐项比较一致；上线后端口、网络/别名、日志轮转保持。新容器首次日志汇总无错误或警告，RestartCount=0、未 OOM。

## 发布与回滚

```bash
./scripts/build-release.sh feb9d02768402e1fe16d3719d076b296d2836240
TRAVEL_CARDS_TEST_IMAGE=sha256:918dcc4c9a8c2565d2eff44875159de97458a255f256029da16c5ed60a60936d npm run test:oauth
npm run deploy -- feb9d02768402e1fe16d3719d076b296d2836240 --skip-tests
```

使用 `--skip-tests` 是因为同一固定 image ID 已完成隔离验收，避免重复；源码溯源、原配置快照、生产健康与失败自动回滚仍执行。实际切换成功，未触发生产回滚；含凭证的临时快照已按脚本清理。

旧镜像保留：`sha256:61b6a6aff597b0220dd4183e83f2bb12a0402ef4500d145051b5631aeaa1c479`，标签 `travel-cards:git-6a5f28d045ff1e13ffe6340a24279bba05656fb2`，源码 SHA `7e60d5cea79a56b843dca9dafb5fb91cbe69fa7159f1c406a46daafbcad9803c`。无数据迁移；后续若需回滚，取得相应授权后以该 image ID 调用发布脚本并复验健康及公网。旧镜像含已知依赖公告，回滚只用于恢复服务，不能视为修补版本。

## 未覆盖与观察项

公网浏览器一度记录详情文档 503（响应 server=cloudflare）及一条 CSP default-src 回退提示；随后同一路径源站/公网直接导航均 200，首页到详情可用，观察窗口源站 Nginx 无 5xx。原因尚未确认，未修改边缘规则或 CSP；如真实访问复现，按时间和请求 ID 对照边缘/源站日志排查。

未调用真实 Gemini/R2、签发生产测试授权或在生产后台写入；当前版本 Gemini 网页/手机、图片、发布确认、冲突与撤销专项仍待用户验收。未进行生产恢复、压力测试或真实手机测试。后续优先完成实际客户端专项与正常使用观察，配置后台继续等待具体字段需求。
