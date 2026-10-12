# Travel Cards MVP Specification

- **状态**：核心应用已实现；MCP 权限/工具/令牌底座及本地 OAuth/DCR/PKCE 同意撤销流程已实现，业务 MCP 服务端已通过本轮门禁上线，Gemini 网页/手机双端验收已完成（用户确认），配置后台未完成；生产状态以 README 的实测记录为准
- **更新日期**：2026-10-12
- **项目根目录**：`/home/lin/travel-cards`
- **产品语言**：首版中文界面与中文内容

## 1. 目标

构建一个公开可浏览、供单一管理员和授权外部 AI 协作维护的中文旅行攻略工作台。管理员可编辑旅行攻略并发布为适合分享的卡片/详情页；应用内 Gemini 助手可：

1. 根据目的地、天数、出行时间、预算与偏好生成可编辑攻略草稿；
2. 基于已有攻略回答问题并给出可选择采纳的行程调整建议；
3. 使用 Google Search 检索公开资料，生成带可点击来源的建议。

应用内 Gemini 助手的输出是候选内容，不自动发布。现有受信任自动化内容流水线（如 Hermes）通过 API Token 直接创建、发布与更新攻略的能力保留。

已确认的产品方向是通过受鉴权 API 和 MCP 让外部 AI 客户端制作、修改及直接发布攻略；Gemini 网页与手机 App 双端验收已由用户确认完成。外部 AI 没有删除或配置管理权限；这不是将应用内候选助手升级为自主写库代理。受限凭证、OAuth 与业务 MCP 已实现并在生产启用；新环境开关默认关闭，真实双端验收已完成（用户确认），配置后台未完成，见 3.3、4.5。

## 2. 项目载体决定

采用新的独立项目 `travel-cards`。

- **拒绝直接扩展既有项目**：立项时 `~/.hermes/projects/` 没有同时拥有旅行内容、公开页面、管理员 CMS、R2 图片和 Gemini Agent 生命周期的应用。
- **拒绝复用文章总结项目**：`article-workflow` 与 `hermes-gsummary-workflow` 的 owner 分别是博客内容流和摘要后端，扩展会造成持久语义混乱。
- **复用范围**：只复用成熟模式和上游 SDK，不共享运行时状态、数据库或 active Hermes 配置。

## 3. 用户与权限

### 3.1 访客

无需登录即可：

- 查看已发布攻略列表；
- 打开攻略的公开分享页；
- 查看封面图、目的地、摘要、逐日行程、实用提示和来源链接。

访客不得访问草稿、管理 API、AI Agent 或上传接口。

### 3.2 管理员与自动化凭证

首版由单一管理员控制，支持两种身份校验渠道：

1. **Web 管理后台**：通过 Auth.js 账号密码登录，基于 JWT Session Cookie；
2. **自动化/M2M 调用（Hermes）**：通过请求头 `Authorization: Bearer <API_TOKEN>` 进行身份校验。API Token 从环境变量 `HERMES_API_TOKEN`（或 `API_TOKEN`）读取，使用常数时间比对（timing-safe equal）。

管理员与持有有效 Token 的自动化客户端可以：

- 新建、编辑、预览、发布、撤回和删除攻略；
- 上传攻略图片至 Cloudflare R2；
- 调用 AI Agent 生成草稿、问答和调整建议；
- 审核后显式采纳 AI 建议。

每个管理端页面校验管理员 session；每个写 API 校验管理员 session 或有效 API Token。有效 Token 写请求不受针对浏览器的同源 CSRF 拦截。

### 3.3 外部 AI 客户端（服务端已上线，真实双端验收已完成）

- 保留 3.2 的现有 API Token 接口，**包括有效 Token 调用 DELETE 删除攻略的能力**，不因后续 MCP 接入而移除。新增 MCP 使用独立受限 AI 身份；外部客户端只通过受鉴权应用接口调用共享 Guide 业务规则，不直接访问 MongoDB。
- 受限外部 AI 身份允许读取、创建、修改及直接发布攻略；发布仍须通过现有完整性、slug 唯一性及 revision 校验，不额外要求管理员在应用内审核。不得绕过客户端自身的写入确认。
- 外部 AI 禁止删除攻略或修改应用配置；管理员保留删除及配置管理权限。撤回暂不开放；图片上传与替换能力已由 2026-10-10 用户授权开放（提供 `upload_image` 工具用于上传封面及替换攻略图片，需 `image.upload` 权限）。
- **现状缺口**：当前 API Token 属于管理员等价凭证，仍可调用 DELETE；管理 API 尚未接入受限 AI 认证。能力守卫、长效令牌及 OAuth/DCR/PKCE 管理员同意/撤销已实现，业务 MCP HTTP adapter 已上线并启用；新环境开关默认关闭，真实 Gemini 双端验收已由用户确认完成。新增业务 MCP 或向外部 AI 开放凭证前，必须落实服务端能力隔离并验证禁止操作；只不展示删除工具不能满足权限要求。
- 首个客户端目标为 Gemini 网页及手机 App，不能用 Gemini API / CLI 联调代替。账号、地区、语言、服务端认证与客户端兼容性均需真实验收，详见 `docs/roadmaps/ai-client-integration.md`。
- 认证实现按 Gemini 官方帮助支持的 OAuth + Dynamic Client Registration（DCR）方向推进，不再以用户逐屏截图为开发前置条件。DCR 注册不授予攻略权限，仍需管理员同意客户端授权、精确 resource/audience 与 scopes 校验及服务端撤销；不能复用管理员 Token。方向与实现状态见 `docs/decisions/2026-10-09-gemini-mcp-auth.md`，授权服务器与业务 MCP 已实现并上线，用户已确认真实 Gemini 双端验收完成，记录见[接入路线图](./docs/roadmaps/ai-client-integration.md#真实双端验收用户确认)；此结论不是由服务端上线或单测推定。

#### 3.3.1 受限访问令牌底座

- 内部签发/撤销函数仅接受已认证管理员 Session；默认关闭的 `/api/oauth/token` 仅从已验证客户端注册、管理员明确同意、S256 PKCE 与一次性授权码流程签发，不能仅凭客户端自报标识、Cookie 或旧管理员 Token 获得令牌。
- 访问令牌为服务端生成的随机、长效 opaque 凭证（默认 100 年长效持久，2026-10-10 用户指示：为保证 Gemini 客户端接入后长效可用且请求不过期，经管理员同意授权的 OAuth 客户端注册与受限访问令牌均保持长效持久；管理员仍可通过后台随时主动撤销客户端及令牌），数据库仅存 SHA-256 摘要、client ID、授权 scopes、精确资源 URI 和过期/撤销状态；明文仅在签发返回值中提供一次，不进入日志或模型提示词。这是动态授权产物，不改变环境变量管理既有管理员 API Token/第三方密钥的规则。
- scopes 仅限 `guide.read/create/update/publish` 及 `image.upload`，按实际授权取子集；读取为工具发现所需的基础 scope。缺少或不匹配 scopes 默认拒绝，不因 `restricted-ai` 角色自动获得全部批准能力。
- 令牌绑定由服务端 `AUTH_URL` 确定的正式 `/mcp` 资源，不接受任意客户端 resource，不用于公开探针或管理员 REST。正式 OAuth 认证逐次查询有效令牌及 active 客户端授权，拒绝裸内部令牌；TTL 清理延迟不能延长权限。撤销阻止其后开始的认证，不能取消已通过认证的在途操作。
- 不提供 refresh token；fake 客户端与隔离 MongoDB 测试不能代替 Gemini 双端验收。内部签发函数不等于可直接向外部客户端授权，正式接入须满足下节。

#### 3.3.2 OAuth / MCP 闭环契约（已实现，双端验收用户确认完成）

- 使用成熟 OAuth 服务端库提供仅授权码模式，强制 S256 PKCE、精确注册的 HTTPS redirect URI、`state`、规范 MCP `resource` 与批准 scopes。不启用 implicit、密码、client credentials 或 refresh grant。
- DCR 支持 public `none` 及 `client_secret_basic` / `client_secret_post`；缺省按注册规范使用 basic。动态 secret 仅签发时返回，数据库仅存摘要。注册不授权内容；注册入口限制实际请求体与每小时全局配额，注册和授权记录默认长效保持（100 年，2026-10-10 用户指示），管理员可随时主动撤销。
- DCR 省略 `scope` 时，可申请范围默认仅为 `guide.read guide.create guide.update guide.publish image.upload`（2026-10-10 用户批准增加图片上传能力）；显式 scope 保持其子集限制，空值/未知权限仍拒绝。此范围不是授权，必须经过管理员同意才可签发对应令牌；授权请求省略 scope 仍默认只读。已有注册与令牌不自动扩权。
- 管理员在登录后看到未验证客户端名称、精确回调地址与权限，明确同意后才生成一次性 5 分钟授权码。确认意图同样短效、单次消费且服务器存储；表单不能自报 scopes、角色或客户端。所有同意/撤销 POST 校验管理员 Session 与固定服务端同源，旧管理员 Token 不能代替同意。
- 客户端撤销持久化并统一使其已有授权码、令牌及尚未确认的授权意图失效；已撤销客户端需重新注册并获得明确同意。并发换码最多成功一次，撤销阻止后续认证，不取消已认证的在途工作。
- 路由边界（2026-10-10 用户确认）：`/api/*` 保留 REST API（含 `/api/oauth/*`），`/mcp` 为唯一正式业务 MCP 入口；路径式资源元数据为 `/.well-known/oauth-protected-resource/mcp`。不保留旧 `/api/mcp` 或旧路径式元数据别名，不重写既有授权记录；旧 resource 的意图、授权码和令牌须拒绝，客户端重新授权。公开 `/api/mcp-probe` 保持独立且不变。
- 正式 `/mcp` 仅接受已批准、绑定 active 客户端授权的受限令牌，不接受裸内部令牌、管理员 Token 或 Cookie。发现、注册、授权/换码、业务 MCP 由环境开关 `MCP_OAUTH_ENABLED=true` 启用，默认关闭；无效令牌 401、权限不足 403 并提供标准 discovery challenge，409 等业务错误保留原代码且不自动重试。
- 本批增加管理员授权列表/撤销和授权同意页面，复用既有样式。OAuth 不要求逐篇发布审批；外部 AI 的操作范围仍仅 Guide read/create/update/publish 与 image.upload。
- 先完成本地 fake 客户端完整流程、输入/重放/并发/撤销/跨资源/REST 绕过回归及 AGY 审查。生产部署、开关启用、真实账号和 Gemini 双端验收需单独授权，不修改既有生产凭证。

### 3.4 临时 MCP 连接探针（2026-10-09 已授权）

用户已允许在现有域名部署最小 MCP 联调入口 `/api/mcp-probe`。该入口公开、无身份认证，仅提供返回固定非敏感信息的 `connection_check` 测试工具；不读取攻略、数据库或环境凭证，不获取对话内容，不调用 Gemini/R2，不执行业务写入。不接受工具参数或透传任意请求，不记录请求体、认证头或客户端上下文。

探针使用标准 Streamable HTTP 的无状态 JSON 响应方式，校验 Origin、协议和有界 JSON 输入；不提供 SSE 长连接或业务工具。联通成功仅证明此传输方式可用，不代表客户端认证、授权撤销、手机 App 或业务 MCP 已验收。生产部署仅包含已提交基线与探针代码，不夹带其他未提交实现；保留原镜像供显式回滚，探针下线需单独执行。

## 4. MVP 功能范围

### 4.1 攻略管理

每篇攻略至少包含：

- 标题；
- 唯一 slug；
- 目的地；
- 简介；
- 出行天数；
- 封面图片（草稿可空，发布必填且必须有 alt 文本）；
- 按天组织的行程；
- 交通、住宿、餐饮、预算、安全/注意事项等可选章节；
- 来源列表；
- 状态：`draft` 或 `published`；
- 创建、更新和发布时间。

管理员与持有有效 Token 的调用方可预览草稿。只有显式发布或在创建时满足完整性校验并声明直接发布后，公开 URL 才可访问。

### 4.2 分享卡片与详情导览

“旅行卡片”是同一篇攻略的列表卡片、Open Graph 预览和公开详情呈现，不创建第二套 Card 数据模型。公开详情 URL 使用稳定 slug，例如 `/guides/[slug]`。公开详情页支持结构化逐日行程与实用板块（交通出行、住宿推荐、餐饮美食、费用预算、安全防范、实用建议及参考资料）的全章节快速跳转导航与锚点定位。

首版提供可复制公开链接和基础 Open Graph metadata；不接入第三方社交平台发布 API。

### 4.3 应用内 AI 助手

本节约束应用内 Gemini orchestration；不适用于 3.3 授权外部客户端的显式内容操作。应用内助手只有三个受控动作：

- `generateGuideDraft(input): Promise<AiResult<GuideCandidate>>`：返回完整但未保存的结构化攻略候选；
- `reviseGuide(existingGuide, instruction): Promise<AiResult<GuideCandidate>>`：返回变更建议或候选新版，不直接覆盖原文；
- `answerGuideQuestion(existingGuide, question): Promise<AiResult<GuideAnswer>>`：基于当前攻略回答，并在使用联网事实时返回来源。

三个动作统一返回带 `kind` 鉴别器的结果：`candidate` 携带经过 schema 校验的候选数据，`clarification` 携带一个或多个需要管理员回答的问题。生成参数至少包含目的地、天数、预计出行日期或季节、预算级别、同行人群和偏好；缺少影响结果的必要字段时必须返回 `clarification`，不得自行假定关键约束。

联网能力使用 Gemini Interactions API 的 Google Search grounding，并仅选择官方能力表同时支持 Google Search 与 structured output 的模型。应用保存并展示返回的来源标题、URL 及其与输出的关联信息；不得把模型自行拼出的无 grounding URL 当作已验证来源。选定模型能否组合 `google_search` 与 `response_format` 必须由一条显式真实 smoke 验证；能力不匹配时配置失败，不静默移除引用或结构校验。

服务端以通过 schema 校验的 JSON 作为候选主体，并从 Gemini 响应级 grounding annotations/metadata 提取标题、URL 与 cited text，组装或覆盖候选中的 `sources`；不得要求模型在正文 JSON 中自行编造来源元数据。

所有 AI 调用必须：

- 仅在服务端执行；
- 设置超时和单次请求边界；
- 校验结构化输出后才交给 UI；
- 保留“生成中、成功、失败、可重试”状态；
- 不把 Auth、MongoDB 或 R2 凭证放入提示词；
- 不拥有发布、删除、上传或任意数据库写入工具；
- 由管理员明确点击“采纳”后才把候选内容写入攻略。

首版不引入 LangChain、LangGraph 或其他 Agent 框架。一个服务器端 Gemini orchestration 模块足以承载三个动作；只有真实需求出现多代理协作、可恢复长任务或复杂工具状态机时再评估框架。

### 4.4 攻略检索与关键词搜索

随着已发布攻略与草稿增加，系统提供轻量、安全、高效的关键词搜索能力：

- **搜索范围**：支持针对标题（`title`）、目的地（`destination`）和简介（`excerpt`）进行大小写不敏感的中文关键词模糊匹配；
- **公开端**：访客可在首页通过搜索框检索已发布攻略，支持即时响应与基于 URL 查询参数（`?q=...`）的直达分享；
- **管理端与 API**：`/api/guides?q=...` 支持参数检索并对外部输入进行正则转义（ReDoS 防护），保持仅返回匹配卡片核心元数据；
- **安全约束**：搜索仅执行只读过滤，关键词最多 200 个字符，并严格遵循访客绝不可见未发布草稿的既有安全边界。

这里的“关键词搜索”只针对标题、目的地和简介做受限匹配，不承诺全文索引、分页检索或复杂筛选能力。

### 4.5 MCP 与配置管理（MCP 已上线，配置管理待实现）

- MCP 复用 3.3 的受限 AI 身份及现有 Guide 业务规则，不另建攻略存储，不向模型暴露通用执行、数据库、凭证或删除工具。
- 保留现有 API Token 接口；新的客户端认证方式必须满足 Gemini 网页／手机 App 的实际支持，不能假定客户端可以输入当前 Bearer Token。
- 配置管理属于管理员后台能力，仅管理非敏感应用设置。字段清单及存储方式实现前确定；API Key、Auth、数据库和 R2 凭证仍使用环境变量，不在后台展示或回传给外部 AI。
- OAuth 授权与业务 MCP endpoint 已上线，真实 Gemini 双端验收已由用户确认完成；配置 API 尚未完成，不增加模型厂商专用 Agent 框架或自主后台任务。

## 5. 数据契约

首版以一个 `Guide` 聚合为主，避免过早拆分集合。

```ts
type GuideStatus = "draft" | "published";

type SourceRef = {
  title: string;
  url: string;
  accessedAt: string;
  citedText?: string;
};

type ItineraryDay = {
  day: number;
  title: string;
  items: Array<{
    time?: string;
    place: string;
    description: string;
    tips?: string;
  }>;
};

type Guide = {
  id: string;
  title: string;
  slug?: string;
  destination: string;
  excerpt: string;
  days: number;
  coverImage?: {
    objectKey: string;
    publicUrl: string;
    alt: string;
  };
  itinerary: ItineraryDay[];
  sections: Array<{
    kind: "transport" | "stay" | "food" | "budget" | "safety" | "other";
    title: string;
    body: string;
  }>;
  sources: SourceRef[];
  status: GuideStatus;
  revision: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type GuideCandidate = Omit<
  Guide,
  "id" | "slug" | "coverImage" | "status" | "revision" | "publishedAt" | "createdAt" | "updatedAt"
>;

type GuideAnswer = {
  answer: string;
  sources: SourceRef[];
};

type AiResult<T> =
  | { kind: "candidate"; data: T }
  | { kind: "clarification"; questions: string[] };
```

约束：

- 草稿可暂时没有 `slug`；发布前必须生成并通过唯一性校验，发布后保持稳定；数据库使用仅作用于已设置 slug 的唯一索引；
- `days >= 1`，行程 day 编号不得重复且不得超出 `days`；
- `published` 攻略必须有标题、slug、目的地、简介、带 alt 的封面图片和至少一天行程；
- 来源 URL 必须是 `http` 或 `https`；
- 图片只存 R2 object key、公开 URL 和 alt 文本，不把二进制写入 MongoDB；
- 删除攻略不会默认删除可能被复用的 R2 对象，孤儿清理后置为显式维护任务。
- `revision` 从 1 开始；管理端 PATCH 必须提交读取时的 revision，冲突时返回 409 并保留双方内容，避免多标签页静默覆盖。
- 应用内 AI 候选不生成 `slug`、`coverImage`、状态、revision 或时间戳；图片通过受鉴权上传接口提供，外部 AI 使用已批准的 image.upload scope 调用 upload_image；应用内候选助手不获得上传能力。

## 6. 技术边界

- **Web**：Next.js App Router、TypeScript、Tailwind CSS；页面与 Route Handlers 位于同一应用。
- **数据库**：MongoDB + Mongoose；与 Meemo 项目共用其 `mongodb` 服务、`meemo_backend` Docker 网络和数据卷，Travel Cards 不创建或管理第二个 MongoDB 服务。
- **认证**：Auth.js 单管理员 Credentials 流；密码使用不可逆哈希校验，session cookie 采用安全默认值。
- **AI**：Google Gemini Interactions API；具体稳定模型由 `GEMINI_MODEL` 配置，默认值在实现时依据官方支持列表确定并由测试覆盖。
- **联网来源**：Gemini Google Search grounding；UI 展示官方响应中的 grounding 来源。
- **图片**：Cloudflare R2 S3-compatible API。首版采用同源、服务端中转上传：Next.js Route Handler 先验证管理员、声明 MIME、文件签名与实际字节数，再以服务端凭证写入 R2。单个图片文件上限为 10 MiB，multipart 请求总包络上限为 `10 MiB + 64 KiB`，只允许 `image/jpeg`、`image/png`、`image/webp`；object key 由服务端生成。单管理员小图片场景不引入 presigned URL、R2 CORS 或 Worker 上传代理。
- **运行目标**：本地 Docker Compose 只启动 Web，并接入 Meemo 已运行的 MongoDB。R2 和 Gemini 使用真实远端服务，但测试默认使用 fake transport。

## 7. 服务端接口边界

接口命名可在实现时按 Next.js 约定调整，但行为必须覆盖：

- `GET /api/guides`：公开请求只返回已发布条目；管理员或携带有效 Token 请求可显式查看草稿（`?scope=admin`）；
- `POST /api/guides`：管理员或携带有效 Token 请求新建草稿；若携带 `publish: true` 或 `status: "published"` 且满足发布完整性要求，直接发布；
- `GET/PATCH/DELETE /api/guides/[id]`：管理员或携带有效 Token 请求读取和修改攻略或删除攻略；PATCH 需要 expected revision，冲突返回 409；
- `POST /api/guides/[id]/publish`：管理员或携带有效 Token 请求显式发布；
- `POST /api/guides/[id]/unpublish`：管理员或携带有效 Token 请求显式撤回为草稿，并清空 publishedAt；
- `POST /api/uploads`：管理员或携带有效 Token 请求上传一张受限图片，服务端校验后写入 R2；
- `POST /api/ai/generate`：生成攻略候选；
- `POST /api/ai/revise`：生成调整候选；
- `POST /api/ai/answer`：基于攻略问答；
- `GET /api/health/live`：存活探针，返回进程存活状态（无条件 200，no-store）；
- `GET /api/health/ready`：就绪探针，探测 MongoDB 连接与 ping（就绪 200，未就绪 503，no-store）。

所有写接口均校验请求体，返回稳定错误结构，支持管理员 Session 或 `Authorization: Bearer <TOKEN>` 鉴权，且不得依赖客户端传入的无凭证“管理员”标志。

## 8. 安全与数据保护

- 环境变量至少包括 Auth secret、管理员身份/密码哈希、MongoDB URI、Gemini API key、Gemini model、R2 endpoint/bucket/access keys、public base URL 以及可选的 `HERMES_API_TOKEN`。
- API Token 长度不得少于 16 个字符，校验采用常数时间比较防范时序攻击。
- `.env*`（示例文件除外）不得提交 Git。
- 所有 JSON 写请求在鉴权和同源校验后、解析前限制为 2 MiB；缺失或不可信的长度仍执行有界流式读取。上传 Route Handler 必须在读 body 前拒绝已声明超过 `10 MiB + 64 KiB` multipart 包络上限的请求；对缺失或不可信的长度仍执行有界流式读取，并在解析后独立拒绝实际图片文件超过 10 MiB 的请求。同时校验 MIME 与文件签名一致。object key 由服务端生成，不接受任意路径。
- Markdown 或结构化正文渲染必须防止脚本注入；不允许未经净化的 HTML。
- AI 请求不得接收任意系统提示词或工具定义；用户内容作为不可信数据处理。
- 公开页面不得泄露草稿、内部错误、模型提示词、凭证或原始供应商响应。
- 当前删除、发布、撤回属于显式管理员操作或 3.2 受信任 Token 的显式调用；应用内 Gemini 助手无权调用。3.3 的外部 AI 身份可以显式发布，但不得删除或管理配置；受限能力底座已实现；业务 MCP 已覆盖本地端到端禁止操作验证；扩展审查与服务端上线门禁已通过；真实 Gemini 双端验收已完成（用户确认）。

## 9. 非目标

首版不包含：

- 多用户注册、作者主页或用户生成内容；
- 收藏、点赞、评论、关注；
- 标签筛选、全文索引和复杂检索；
- 自动社交平台发布；
- 地图路线优化、实时导航或预订；
- 支付、通知、离线 App；
- 应用内 AI 自动发布、自主循环或后台常驻 Agent（不排除 3.3 已批准的外部 AI 显式发布）；
- 多模型路由、向量数据库或 RAG 基础设施；
- R2 孤儿对象自动清理。

## 10. 验收标准

### 10.1 项目与运行

- 新环境复制示例变量并准备 Meemo 的 MongoDB 服务及 `meemo_backend` 网络后，可通过文档化命令启动 Web；
- `docker compose config`、lint、测试和 production build 均通过；
- 无凭证时应用给出明确配置错误，不以假成功降级。

### 10.2 权限

- 未登录访客可打开已发布攻略；
- 无有效管理员 Session 且无有效 API Token 的请求访问所有管理、AI、上传和写接口均返回 401/403；
- 携带有效 Bearer API Token 的请求可正常调用管理端写 API、AI 接口和上传接口，且不受针对浏览器的同源限制；
- 草稿不能通过公开列表、公开 slug 或静态 metadata 泄露；
- 管理员可登录、退出并完成完整 CRUD 与发布/撤回流程。
- 两个管理端操作基于同一 revision 编辑时，后提交者收到 409 和可恢复提示，不会覆盖先提交内容。

### 10.3 内容

- 管理员或持有有效 Token 的调用方可创建至少三天的结构化攻略（支持草稿创建与满足发布要求时的直接发布），保存后重新加载内容不丢失；
- 同一 slug 不能重复；
- 删除科目式级联逻辑不适用于本项目：攻略作为单一聚合一次写入，避免跨集合残留；
- 公开详情页具有标题、描述、图片 alt 和基础 Open Graph metadata。

### 10.4 图片

- 管理员或持有有效 API Token 的调用方可通过上传接口把允许的图片写入 R2；
- 无有效认证、超过 10 MiB、错误 MIME 或文件签名不匹配的上传在写入 R2 前失败；
- MongoDB 只保存对象元数据，公开页面可正确显示 R2 图片。

### 10.5 AI Agent

使用 fake Gemini transport 的自动化测试必须证明：

- 三个动作都生成符合 schema 的候选结果；
- 缺少关键旅行参数时返回 `{ kind: "clarification", questions: [...] }`；
- 非法或不完整结构化输出被拒绝，不写入数据库；
- revise 不会在管理员采纳前覆盖原攻略；
- answer 只接收目标攻略所需上下文；
- grounded 结果保留可点击来源；
- 配置的真实模型通过一次手动 smoke，证明同一 Interactions 请求可组合 Google Search 与 structured output；
- 超时、限流和供应商错误显示可重试失败，不产生伪造攻略；
- AI transport 没有发布、删除或任意数据库写入能力。

使用真实 Gemini/R2 凭证的 smoke test 为手动、显式、可跳过门禁，不得成为默认测试的外部副作用。

### 10.6 外部 AI / MCP 与配置管理扩展

真实 Gemini 网页/手机双端验收已完成，依据为 2026-10-12 用户确认；各专项证据范围见[验收状态记录](./docs/roadmaps/ai-client-integration.md#真实双端验收用户确认)。配置后台尚未实现，不能将本节全部扩展项标为已验收。

- Gemini 网页添加 MCP 后在手机 App 可调用，并明确记录验收账号的可用条件及客户端写入确认；未具备条件时标记 blocked，不伪造接入成功。
- 受限 AI 身份可读取、创建、更新及直接发布；DELETE 和配置写接口在服务端拒绝，不能借其他 API 绕过，拒绝后数据不变。
- 修改冲突维持 409，不静默重试覆盖；直接发布遵守与管理员相同的完整性校验。
- 现有受信任自动化 API Token 兼容性和管理员完整权限有回归验证。
- 管理后台只管理批准的非敏感配置，凭证继续来自环境变量，不能读取到浏览器或回传给 MCP 客户端。
- 配置字段、客户端认证方式和额外 AI 能力在实现前明确；默认测试使用 fake transport，不依赖真实 Gemini、R2 或外部发布。

## 11. 风险与停止条件

- **事实时效性**：旅行政策、开放时间和价格会变化。UI 必须显示来源与访问时间，并提示用户出发前复核官方信息。
- **AI 幻觉**：结构化输出不是事实保证；无 grounding 的断言不得伪装为已验证来源。
- **费用与配额**：Gemini 搜索 grounding 与 R2 均可能产生费用；首版限制单请求输入、输出和超时，不实现无限自动重试。
- **上传滥用**：同源上传必须同时校验 session、声明长度、实际长度、MIME 和文件签名；任一门禁无法落实时停止开放上传，而不是暴露 R2 凭证或降级为无限制直传。
- **权限失败**：任何能让访客访问草稿或写接口的测试失败均为发布 blocker。
- **数据迁移**：schema 发生破坏性变化前必须先备份并提供回滚步骤。

## 12. 验证与回滚

实现阶段至少运行：

```bash
npm test
npm run lint
npm run build
docker compose config
```

回滚以 Git 提交为边界；数据库 schema 变更必须向后兼容或附可验证的备份/恢复步骤。外部 R2/Gemini 配置与应用代码分离，禁用对应环境变量即可停止相关能力，不影响已有攻略的只读浏览。

## 13. 官方依据

- Gemini Google Search grounding：<https://ai.google.dev/gemini-api/docs/grounding>
- Gemini structured outputs（含 Google Search 组合示例）：<https://ai.google.dev/gemini-api/docs/structured-output>
- Gemini tools：<https://ai.google.dev/gemini-api/docs/tools>
- Cloudflare R2 upload objects：<https://developers.cloudflare.com/r2/objects/upload-objects>
- Cloudflare R2 S3 API：<https://developers.cloudflare.com/r2/get-started/s3>
- Next.js Route Handlers：<https://nextjs.org/docs/app/building-your-application/routing/route-handlers>

## 14. 后续授权边界

核心应用及历史 Gemini/R2 传输 smoke 已完成，UI 精修已部署。真实服务当前配置和外网可用性不由历史 smoke 推定。

已批准 3.3 的产品方向：保留 API Token、增加 MCP、允许受限外部 AI 创建/修改/直接发布、禁止其删除/配置管理，并由管理员管理非敏感配置。内部权限/工具/令牌底座及本地 OAuth/DCR/PKCE 同意撤销已实现，业务端点已通过扩展审查并上线，真实 Gemini 双端验收已由用户确认完成，配置后台仍待完成；当前实现和证据入口见 README 及接入路线图，不将早期产品初始化或内部测试当作客户端集成验收。

创建远端资源、修改凭证、部署、付费调用和外部写入仍需对应操作的明确授权。后续超出上述边界的新产品功能，必须先修订并确认本 spec。
