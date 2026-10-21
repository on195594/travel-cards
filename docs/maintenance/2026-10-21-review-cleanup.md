# 2026-10-21 项目审查、文档对齐与临时文件清理

## 范围与结论

Travel Cards 是单一管理员与授权 AI 协作维护旅行攻略的 Next.js 应用，同一份 Guide 用于后台编辑、公开列表与详情。按单管理员、小规模内容站审查，不假设高并发或多租户需求。

审查基线：`f0c870bfc301b4ed17d823f94c0eb2b0b481bc4d`，开始时 Git 工作区干净。重点追踪身份/能力检查、攻略写入与 revision、MCP/OAuth、AI 候选及图片上传，检查依赖、构建/测试脚本、入口可达性和文档引用。

**结论：本地门禁通过；URL 图片上传网络边界和运行镜像溯源仍需后续处理，不能据此宣布安全审查全部通过。** 本轮仅修改文档、整理本地临时文件；没有改业务代码、权限或接口行为，没有提交、push、部署、重启或改动共享数据库。

## 必须修复

### 1. URL 图片上传的私网校验可绕过（P1，未修复）

- **位置**：`src/lib/mcp/guide-tools.ts:9-44`，`isPrivateHost` / `fetchImageFromUrl`。
- **作用**：有 `image.upload` 权限的客户端可让服务器下载 HTTPS 封面；服务端逐跳检查主机名，然后调用 `fetch`。
- **具体问题**：没有解析并校验实际 DNS 地址，也没有将验证地址固定到连接；IPv4-mapped IPv6 字面量同样漏检。`https://[::ffff:127.0.0.1]/cover.png` 经 URL 规范化后主机名为 `[::ffff:7f00:1]`，现有校验返回 false（不拦截）。`[::ffff:c0a8:101]` 也未拦截。
- **验证**：对当前源码中原函数做离线断言：`127.0.0.1`、`::1` 被拦截，上述 mapped 地址未被拦截；没有向内网发送请求。DNS 风险已在接入路线图记录，本轮补充了字面量绕过的具体证据。
- **最小完整修复方向**：统一校验 IPv4/IPv6（包括 mapped 地址）及全部 DNS 结果，在连接时固定已验证的公网地址，每次重定向重验，并补 fake resolver/transport 测试；若不能立即完成，另行确认是否暂时禁用 URL 输入，仅保留 Base64。不能只增加一次 DNS 查询后仍让 `fetch` 再解析。
- **不处理的风险**：持有上传 scope 的客户端可触发非预期内网连接尝试（SSRF，即借服务器访问内部地址）；是否能读取内容取决于目标服务及 TLS 证书。未验证实网利用，也不声称已发生泄露。

### 2. 当前运行镜像无法对应已记录的应用提交（P2，文档已纠正，运维未改）

- **位置**：根 `README.md` 的版本说明、`docker-compose.production.yml` 的固定镜像契约，以及运行容器 `travel-cards-web-1`。
- **具体问题**：历史文档曾把 `587df41` 表述为当前已核对版本；本轮只读 inspect 看到容器使用可变标签 `travel-cards-web`，镜像缺少 `org.opencontainers.image.revision`。镜像 ID 为 `sha256:aa02a082ff55cade13821534649d68107ee90ff28d612e288c08f279650eb9bf`；运行状态为 running，但不能据此确认源码版本。
- **最小修复方向**：下次获授权发布时，从明确提交构建固定标签镜像，写入 revision，保留源码清单和回滚证据，再核对运行镜像。没有证据时不猜测当前容器来自哪个提交。
- **不处理的风险**：难以证明已包含哪项修复，回滚或排查可能选择错误版本。本轮已将现行说明改为“最近有正式记录的部署”，不重写历史部署记录，也未重新部署。

## 已知限制，不借清理扩展功能

- 图片本身最多 10 MiB，但 `/mcp` 使用 `readJsonBody` 的 2 MiB 整体请求上限（`src/lib/http.ts:5`、`src/lib/mcp/http-server.ts:104`）。Base64 原始图片约 1.5 MiB 即接近上限，另需 JSON 开销；工具文案的“10MB”不代表大图 Base64 可穿过 HTTP 层。本轮保留既有安全上限，未扩大请求体。
- Gemini 双端验收仍沿用 2026-10-12 用户确认，不推定图片上传、冲突、撤销等专项均已通过。非敏感配置后台尚未实现。

## 目录与死代码核对

- 新增 [文档与目录导航](../README.md)，保留 Next.js 约定目录与根配置文件，不做无收益搬迁。
- 从 `src/app/` 文件约定入口追踪相对及 `@/` 模块引用，未发现不可达的应用 TS/TSX 模块。额外启用 TypeScript 未使用局部/参数检查，无告警。
- CSS class 与 `src/`、测试、脚本中的文本引用交叉检查未发现未引用候选；这不是完整动态 CSS 语义证明。
- `src/lib/guides.ts` 仍有调用方；OAuth/MCP、公开探针、脚本和权限/冲突测试均有用途，不为追求删除行数而移除。没有确认可安全删除的业务代码或重复测试套件。
- 保留 `.hermes/plans/` 历史记录、`.impeccable/` 配置、静态资源、本地遗留 `deploy.sh`、凭证、旧备份、依赖、构建缓存及 Docker 镜像。遗留发布脚本不是当前发布入口，未执行它。

## 临时文件清理

清理前发现两份候选源码快照各有 134 个文件；其中分别有 6 个、11 个文件的内容不在可达 Git 历史中。不能仅凭已有 source manifest 就断言这些快照可重建，因此先完整归档，再删除原临时副本。

- 清理：`tmp/` 下 7 个旧发布目录及 2 个旧清理报告，共 **322 个文件，2,713,720 文件字节**；目录名和逐文件 SHA-256 保存在本地归档清单。
- 恢复材料：`backups/cleanup-2026-10-21/tmp-release-artifacts.tar.gz`（1,044,627 字节）及同目录 `manifest.json`，均为 Git 忽略的本地文件，不随仓库分发。
- 归档 SHA-256：`0eb67b3f05dbd8b4f87b445d1af272e966d8e0ba9b9150d77ae3b5dd1b4af6b5`。
- 删除前逐一比较归档内全部文件与原文件 SHA-256，并再次确认原文件未变化；归档完整后才清空 `tmp/`。正式 `docs/reviews/`、`docs/deployments/` 证据全部保留。
- 归档保留独有候选源码和日志，不将其误当成已通过门禁或已部署源码。没有删除、压缩或改写此前备份。

## 文档对齐

- 根 README、前端文档、产品定位及 AI 接入路线图统一区分“源码已有”“历史部署”“当前运行版本未确认”和“用户验收”。
- SPEC 补充 `f0c870b` 已实现的来源日期输入归一化说明；没有增加新产品能力或放宽权限。
- 将“图片专项未完成”的无证据判断改为“未单独确认”；不重写历史 `pending` 或审查结论。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | PASS：21 个文件，284 项测试；隔离 MongoDB |
| `npm run lint` | PASS |
| `npx --no-install tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters` | PASS |
| `./scripts/build-with-test-env.sh`（内部运行 `npm run build`） | PASS；fake 构建环境 |
| `docker compose config --quiet` | PASS |
| `npm run test:oauth` | PASS；生产启动路径 HTTP 内容 smoke + OAuth/MCP，同意/PKCE/发布/409/403/撤销/REST 拒绝；fake 管理员身份，隔离本地 MongoDB |
| `npm run test:recovery` | PASS；合成数据库/图片恢复、校验和、损坏检测、共享实例 sentinel 未改变 |
| Markdown 相对文件链接、`git diff --check` | PASS |
| 临时归档文件 SHA-256 对比、`tmp/` 清空 | PASS |

**未检查**：真实 Gemini/R2 调用、真实账号登录和客户端专项验收、实网 SSRF 攻击、生产数据恢复、浏览器视觉与性能实测、全依赖安全公告扫描。UI 编辑器与历史审查材料未逐行复审；本轮没有授予它们新的审查结论。官方 Gemini 帮助仍保留原核实日期，没有重新查询或承诺其当前可用范围。
