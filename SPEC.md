# Travel Cards MVP Specification

- **状态**：Implemented and locally accepted / real Gemini and R2 transport smoke passed
- **日期**：2026-08-29
- **项目根目录**：`/home/lin/.hermes/projects/travel-cards`
- **产品语言**：首版中文界面与中文内容

## 1. 目标

构建一个公开可浏览、由单一管理员维护的旅行内容应用。管理员可编辑旅行攻略并发布为适合分享的卡片/详情页；Gemini AI Agent 可：

1. 根据目的地、天数、出行时间、预算与偏好生成可编辑攻略草稿；
2. 基于已有攻略回答问题并给出可选择采纳的行程调整建议；
3. 使用 Google Search 检索公开资料，生成带可点击来源的建议。

AI 输出永远是候选内容，不自动发布。

## 2. 项目载体决定

采用新的独立项目 `travel-cards`。

- **拒绝直接扩展现有项目**：当前 `~/.hermes/projects/` 没有同时拥有旅行内容、公开页面、管理员 CMS、R2 图片和 Gemini Agent 生命周期的应用。
- **拒绝复用文章总结项目**：`article-workflow` 与 `hermes-gsummary-workflow` 的 owner 分别是博客内容流和摘要后端，扩展会造成持久语义混乱。
- **复用范围**：只复用成熟模式和上游 SDK，不共享运行时状态、数据库或 active Hermes 配置。

## 3. 用户与权限

### 3.1 访客

无需登录即可：

- 查看已发布攻略列表；
- 打开攻略的公开分享页；
- 查看封面图、目的地、摘要、逐日行程、实用提示和来源链接。

访客不得访问草稿、管理 API、AI Agent 或上传接口。

### 3.2 管理员

首版只有一个管理员，通过 Auth.js 登录。管理员账号与密码校验材料从环境变量读取；仓库不保存明文密码。

管理员可以：

- 新建、编辑、预览、发布、撤回和删除攻略；
- 上传攻略图片至 Cloudflare R2；
- 调用 AI Agent 生成草稿、问答和调整建议；
- 审核后显式采纳 AI 建议。

每个管理端页面和每个写 API 都必须在服务端校验管理员 session。

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

管理员可预览草稿。只有显式发布后，公开 URL 才可访问。

### 4.2 分享卡片

“旅行卡片”是同一篇攻略的列表卡片、Open Graph 预览和公开详情呈现，不创建第二套 Card 数据模型。公开详情 URL 使用稳定 slug，例如 `/guides/[slug]`。

首版提供可复制公开链接和基础 Open Graph metadata；不接入第三方社交平台发布 API。

### 4.3 AI Agent

首版 Agent 只有三个受控动作：

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
- AI 不生成 `slug`、`coverImage`、状态、revision 或时间戳；图片始终由管理员上传。

## 6. 技术边界

- **Web**：Next.js App Router、TypeScript、Tailwind CSS；页面与 Route Handlers 位于同一应用。
- **数据库**：MongoDB + Mongoose；开发环境使用 Docker Volume 保留数据。
- **认证**：Auth.js 单管理员 Credentials 流；密码使用不可逆哈希校验，session cookie 采用安全默认值。
- **AI**：Google Gemini Interactions API；具体稳定模型由 `GEMINI_MODEL` 配置，默认值在实现时依据官方支持列表确定并由测试覆盖。
- **联网来源**：Gemini Google Search grounding；UI 展示官方响应中的 grounding 来源。
- **图片**：Cloudflare R2 S3-compatible API。首版采用同源、服务端中转上传：Next.js Route Handler 先验证管理员、声明 MIME、文件签名与实际字节数，再以服务端凭证写入 R2。单个图片文件上限为 10 MiB，multipart 请求总包络上限为 `10 MiB + 64 KiB`，只允许 `image/jpeg`、`image/png`、`image/webp`；object key 由服务端生成。单管理员小图片场景不引入 presigned URL、R2 CORS 或 Worker 上传代理。
- **运行目标**：本地 Docker Compose 同时启动 Web 与 MongoDB。R2 和 Gemini 使用真实远端服务，但测试默认使用 fake transport。

## 7. 服务端接口边界

接口命名可在实现时按 Next.js 约定调整，但行为必须覆盖：

- `GET /api/guides`：公开请求只返回已发布条目；管理员可显式查看草稿；
- `POST /api/guides`：管理员新建草稿；
- `GET/PATCH/DELETE /api/guides/[id]`：管理员读取和修改草稿或删除攻略；PATCH 需要 expected revision，冲突返回 409；
- `POST /api/guides/[id]/publish`：管理员显式发布；
- `POST /api/guides/[id]/unpublish`：管理员显式撤回为草稿，并清空 publishedAt；
- `POST /api/uploads`：管理员通过同源 multipart 请求上传一张受限图片，服务端校验后写入 R2；
- `POST /api/ai/generate`：生成攻略候选；
- `POST /api/ai/revise`：生成调整候选；
- `POST /api/ai/answer`：基于攻略问答。

所有写接口均校验请求体，返回稳定错误结构，且不得依赖客户端传入的“管理员”标志。

## 8. 安全与数据保护

- 环境变量至少包括 Auth secret、管理员身份/密码哈希、MongoDB URI、Gemini API key、Gemini model、R2 endpoint/bucket/access keys 和 public base URL。
- `.env*`（示例文件除外）不得提交 Git。
- 上传 Route Handler 必须在读 body 前拒绝已声明超过 `10 MiB + 64 KiB` multipart 包络上限的请求；对缺失或不可信的长度仍执行有界流式读取，并在解析后独立拒绝实际图片文件超过 10 MiB 的请求。同时校验 MIME 与文件签名一致。object key 由服务端生成，不接受任意路径。
- Markdown 或结构化正文渲染必须防止脚本注入；不允许未经净化的 HTML。
- AI 请求不得接收任意系统提示词或工具定义；用户内容作为不可信数据处理。
- 公开页面不得泄露草稿、内部错误、模型提示词、凭证或原始供应商响应。
- 删除、发布、撤回属于显式管理员操作；AI 无权调用。

## 9. 非目标

首版不包含：

- 多用户注册、作者主页或用户生成内容；
- 收藏、点赞、评论、关注；
- 标签筛选、全文搜索；
- 自动社交平台发布；
- 地图路线优化、实时导航或预订；
- 支付、通知、离线 App；
- AI 自动发布、自主循环或后台常驻 Agent；
- 多模型路由、向量数据库或 RAG 基础设施；
- R2 孤儿对象自动清理。

## 10. 验收标准

### 10.1 项目与运行

- 新环境复制示例变量后，可通过文档化命令启动 Web 与 MongoDB；
- `docker compose config`、lint、测试和 production build 均通过；
- 无凭证时应用给出明确配置错误，不以假成功降级。

### 10.2 权限

- 未登录访客可打开已发布攻略；
- 未登录请求所有管理、AI、上传和写接口均返回 401/403；
- 草稿不能通过公开列表、公开 slug 或静态 metadata 泄露；
- 管理员可登录、退出并完成完整 CRUD 与发布/撤回流程。
- 两个管理标签页基于同一 revision 编辑时，后提交者收到 409 和可恢复提示，不会覆盖先提交内容。

### 10.3 内容

- 管理员可创建至少三天的结构化攻略，保存后重新加载内容不丢失；
- 同一 slug 不能重复；
- 删除科目式级联逻辑不适用于本项目：攻略作为单一聚合一次写入，避免跨集合残留；
- 公开详情页具有标题、描述、图片 alt 和基础 Open Graph metadata。

### 10.4 图片

- 管理员可通过同源上传接口把允许的图片写入 R2；
- 非管理员、超过 10 MiB、错误 MIME 或文件签名不匹配的上传在写入 R2 前失败；
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

本 spec 批准需求边界，不等同于批准安装依赖、创建远端 R2 资源、调用付费 Gemini API、部署或写入外部服务。下一阶段应先生成最小 Next.js 脚手架与本地测试，再单独配置真实凭证和外部资源。
