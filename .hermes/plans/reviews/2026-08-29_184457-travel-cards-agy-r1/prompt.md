你是 Travel Cards 执行计划的独立工程审查员。只审查下方冻结快照；不得读取、创建、修改或删除任何本地/远端文件，不得运行命令，不得安装依赖，不得调用外部服务。当前是计划审查，不是代码实现审查。

审查目标：判断该计划能否在不引入待替换 runtime fake 的前提下，按真实 Next.js/Auth.js/MongoDB/R2/Gemini 路径安全执行，并找出会导致返工、不可运行、数据泄露、测试失真或验收无法完成的具体问题。

必须覆盖：
- 计划与 SPEC 一致性，是否偷加或漏掉核心用户旅程；
- Phase 顺序、每阶段最小 landing、提交和回滚是否真实可执行；
- create-next-app 合并现有非空 repo 的命令/文件风险；
- Auth.js Credentials、JWT、scrypt、服务端 guard 的实施与测试边界；
- Mongoose partial unique slug、revision 原子并发、测试数据库生命周期；
- Next.js Route Handler 的 10 MiB multipart/内存边界、R2 写入和回滚；
- Gemini Interactions + google_search + response_format、grounding metadata、超时与 SDK 可测试性；
- Docker web+Mongo 构建顺序、环境变量、健康检查；
- 测试命令是否真的按 Vitest CLI 语义执行，是否缺必要工具；
- 外部凭证/付费调用/外部写入确认门禁；
- 是否过度拆分、增加无收益依赖或把未来需求塞进 MVP。

事实边界：用户明确拒绝需要后续替换的 fake/演示业务层。测试可以 mock 网络边界，但生产模块必须从第一天使用真实实现。不要建议 Agent 框架、第二套 Card 模型、多用户、搜索、收藏、向量数据库或多模型路由。

输出必须严格包含：
Verdict: APPROVE_LANDING | REQUEST_BOUNDED_FIXES | BLOCKED_NEEDS_USER_DECISION | NO_ACTION_CLOSE

Blocking findings:
- 每项包含：严重度、冻结快照中的章节/行或原文锚点、失败场景、最小修复、最早阻塞阶段。没有写“无”。

Important findings:
- 非 blocker 但执行前值得修复的问题；同样给锚点与最小修复。

Minor / nice-to-have:
- 仅列不扩 scope 的合理小项。

Engineering design points already correct:
- 列出无需改动的重要设计。

Safety boundary assessment:
- 凭证、外部写入、数据删除、AI 权限、active Hermes 越界。

Overengineering/YAGNI assessment:
- 指出应删除/合并内容；没有写“无”。

Minimal patch directions:
- 按计划文件可直接修改的顺序列出精确修复，不写实现代码。

Recommended next step:
- 只给一个动作。

请用中文回答。

===== FROZEN PLAN =====
# Travel Cards Spec Execution Plan

- **Status:** execution-ready, plan-only artifact
- **Source contract:** `/home/lin/.hermes/projects/travel-cards/SPEC.md`
- **Baseline commit:** `aaca9ea docs: initialize travel cards project spec`
- **Execution owner:** parent Hermes; one independent read-only implementation review after all local gates pass
- **Plan boundary:** this file does not authorize dependency installation, paid Gemini calls, R2 writes, deployment, or credential handling. Those occur only after a later explicit execution request and, for external writes/calls, a separate confirmation.

## Goal

Implement the reviewed MVP on the real production path from the first code change:

```text
Next.js App Router
  → Auth.js single-admin server guard
  → MongoDB/Mongoose Guide aggregate
  → publish/unpublish + public guide pages
  → server-mediated Cloudflare R2 upload
  → Gemini Interactions API with Google Search + structured output
```

There is **no runtime fake implementation and no disposable demo business layer**. Tests may mock only network/provider boundaries while exercising the same application modules used in production.

## Scope

### In scope

- Chinese public guide list/detail and Open Graph metadata.
- Single-admin Auth.js Credentials login with JWT session.
- Real MongoDB persistence, partial unique slug index, publish/unpublish, and revision-based conflict handling.
- Real server-mediated R2 upload code with session, byte-count, MIME, magic-byte, object-key, and 10 MiB checks.
- Real Gemini Interactions code for generate/revise/answer, Google Search grounding, structured validation, clarification results, timeout/error mapping, and explicit human acceptance.
- Docker Compose running both web and MongoDB.
- Automated tests, production build, Docker config validation, local browser smoke, and bounded independent review.

### Non-scope

- Search, tags, favourites, likes, comments, multiple authors, maps/navigation, bookings, notifications, social publishing, vector databases, multi-model routing, Agent frameworks, background autonomous agents, and automatic R2 orphan cleanup.
- Any change to Hermes skills, runtime, cron, memory, Wiki, gateway, or other projects.
- Deployment or remote resource creation.

## Minimum landing change

The first coherent implementation commit must be a **real core path**, not a fake slice:

```text
admin login
  → create/edit Guide in MongoDB
  → publish
  → visitor opens /guides/[slug]
```

It must use the final Auth.js, MongoDB/Mongoose, Zod, API error, and revision contracts. R2 and Gemini land in subsequent commits against these final seams; no core route or data store is replaced later.

## Approved dependency set for the later execution request

The executor must check current official compatibility immediately before installation and let `package-lock.json` pin the resolved versions.

### Runtime

- `next`, `react`, `react-dom`
- `mongoose`
- `next-auth`
- `zod`
- `@google/genai`
- `@aws-sdk/client-s3`

Use Node `crypto.scrypt`/`timingSafeEqual`, `Buffer`, `crypto.randomUUID`, Web `Request`/`Response`, and native CSS/HTML before adding more packages. Do not add bcrypt, upload middleware, slug libraries, Agent frameworks, state libraries, component kits, or SDK wrappers.

### Development

- create-next-app’s TypeScript/ESLint/Tailwind toolchain
- `vitest` only for deterministic unit/service/route tests

Do not add Playwright initially. Use the existing browser-driving capability for one parent-run local smoke; add browser test infrastructure only if repeated UI regressions justify ownership.

## File layout target

```text
travel-cards/
├── package.json
├── package-lock.json
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── vitest.config.ts
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── README.md
├── SPEC.md
├── AGENTS.md
├── scripts/
│   └── hash-admin-password.mjs
├── src/
│   ├── auth.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── guides/[slug]/page.tsx
│   │   ├── admin/login/page.tsx
│   │   ├── admin/guides/page.tsx
│   │   ├── admin/guides/new/page.tsx
│   │   ├── admin/guides/[id]/page.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── guides/route.ts
│   │       ├── guides/[id]/route.ts
│   │       ├── guides/[id]/publish/route.ts
│   │       ├── guides/[id]/unpublish/route.ts
│   │       ├── uploads/route.ts
│   │       └── ai/{generate,revise,answer}/route.ts
│   ├── components/
│   │   ├── guide-card.tsx
│   │   ├── guide-editor.tsx
│   │   └── ai-assistant.tsx
│   └── lib/
│       ├── env.ts
│       ├── db.ts
│       ├── http.ts
│       ├── password.ts
│       ├── guides/{schema,model,repository}.ts
│       ├── ai/{schemas,gemini}.ts
│       └── storage/r2.ts
└── tests/
    ├── password.test.ts
    ├── guides-schema.test.ts
    ├── guides-repository.test.ts
    ├── guide-routes.test.ts
    ├── upload-validation.test.ts
    └── gemini.test.ts
```

The executor may merge a pair of tiny adjacent files if that reduces code without mixing ownership. It must not create interfaces/factories with one production implementation.

## Phase ledger

| Phase | State | Landing outcome |
|---|---|---|
| 0. Preconditions | not_started | Compatible local toolchain and explicit external-resource boundary |
| 1. Real application foundation | not_started | Next.js scaffold, dependency lock, test/build/Docker commands |
| 2. Auth.js administrator boundary | not_started | Final single-admin authentication and server guard |
| 3. MongoDB Guide core path | not_started | Real CRUD/publish/public flow with revision safety |
| 4. Public/admin UI | not_started | Usable Chinese authoring, preview, publish, and reading journey |
| 5. Cloudflare R2 | not_started | Real bounded server upload and persisted image metadata |
| 6. Gemini Agent | not_started | Real generate/revise/answer integration with citations |
| 7. Docker and full acceptance | not_started | Reproducible local stack and all gates green |
| 8. Independent review and closeout | not_started | Reviewed final diff, docs aligned, clean commits |

## Phase 0 — Preconditions (discovery, no writes beyond execution evidence)

### Checks

1. Confirm clean baseline:
   ```bash
   git status --short
   git log -1 --oneline
   ```
   Expected: clean worktree and baseline `aaca9ea`.
2. Check toolchain without installing anything:
   ```bash
   node --version
   npm --version
   docker --version
   docker compose version
   ```
   Require Node.js `>=20.9` per current Next.js documentation.
3. Re-check official APIs before pinning:
   - Next.js create-next-app/App Router
   - Auth.js Credentials + JWT sessions
   - Gemini JavaScript Interactions API, Google Search, structured output
   - Cloudflare R2 AWS SDK v3 S3 endpoint
4. Record installed package versions in the lockfile after scaffolding; do not hard-code guessed versions in prose.

### Stop conditions

- Dirty files not created by this task.
- Node/Docker incompatibility.
- Current official APIs invalidate a SPEC invariant.
- Any credential appears in a command line, tracked file, prompt, log, or diff.

## Phase 1 — Real application foundation (landing)

### Minimum landing change

Generate the final Next.js/TypeScript/Tailwind application and its real dependency graph; do not create demo repositories or runtime fake providers.

### Steps

1. Because the repository is non-empty, run create-next-app in a temporary directory with `--disable-git`, then merge only scaffold files into this repository while preserving `.git`, `README.md`, `AGENTS.md`, `SPEC.md`, and `docs/`:
   ```bash
   npx create-next-app@latest /tmp/travel-cards-next \
     --ts --tailwind --eslint --app --src-dir \
     --import-alias '@/*' --use-npm --disable-git --yes
   ```
2. Remove template branding/assets and merge the minimal scaffold.
3. Install only the approved runtime and test dependencies; pin all via `package-lock.json`.
4. Add scripts:
   ```json
   {
     "test": "vitest run",
     "test:watch": "vitest",
     "lint": "eslint .",
     "build": "next build",
     "dev": "next dev",
     "start": "next start"
   }
   ```
5. Add `vitest.config.ts` for Node-environment tests and alias resolution.
6. Add `Dockerfile`, `.dockerignore`, and `docker-compose.yml` with `web` and `mongodb`, a named Mongo volume, health checks, and no baked secrets.
7. Update `.env.example` only with names/placeholders; preserve `.gitignore` secret exclusions.

### Verification

```bash
npm test
npm run lint
npm run build
docker compose config
```

### Commit

```text
chore: scaffold the real travel cards application
```

### Rollback

`git revert <phase-1-commit>`; remove only the task-created temporary scaffold directory.

## Phase 2 — Auth.js single-administrator boundary (landing)

### Minimum landing change

The final production authentication seam exists before any write route is exposed.

### Steps

1. `src/lib/env.ts`: expose focused server-only readers. Mongo/Auth are required for protected/core operations; Gemini/R2 validate lazily only when those features are called so public reads survive disabled optional integrations.
2. `src/lib/password.ts`: parse a versioned `scrypt$<salt>$<digest>` environment value and verify with `crypto.scrypt` plus `timingSafeEqual`; use one generic login failure.
3. `scripts/hash-admin-password.mjs`: read the password from an interactive/hidden stdin path or environment supplied for that one command, output only the hash, never the password.
4. `src/auth.ts`: configure Auth.js Credentials provider and JWT sessions; return only the fixed admin identity.
5. `src/app/api/auth/[...nextauth]/route.ts`: export handlers.
6. Add `requireAdmin()` at the server boundary and use it in every later admin page/write route.
7. Build `/admin/login` with labeled email/password inputs, keyboard submission, generic error text, and no credential logging.

### Tests

- valid and invalid scrypt records;
- malformed hash fails closed;
- missing admin configuration gives a clear server-side configuration error;
- unauthorized guard returns 401/redirect without disclosing why credentials failed.

### Verification

```bash
npm test -- password
npm test
npm run lint
npm run build
```

### Commit

```text
feat: add the single-admin authentication boundary
```

### Rollback

`git revert <phase-2-commit>`; no database or external rollback is needed.

## Phase 3 — MongoDB Guide core path (landing)

### Minimum landing change

Implement the complete real persistence path:

```text
protected create/edit → MongoDB → publish/unpublish → public slug read
```

### Steps

1. `src/lib/guides/schema.ts`: make the SPEC types executable with Zod:
   - `Guide`, `GuideCandidate`, `GuideAnswer`, `AiResult<T>`;
   - URL/date/day/section constraints;
   - draft vs publish validation;
   - one stable API serialization shape using `id`, never raw `_id`.
2. `src/lib/db.ts`: cache one Mongoose connection across Next.js reloads; fail clearly on missing/failed URI.
3. `src/lib/guides/model.ts`:
   - one embedded `Guide` aggregate;
   - timestamps and `revision` starting at 1;
   - partial unique index on non-empty `slug`;
   - no second Card collection.
4. `src/lib/guides/repository.ts`:
   - public list/get query filters `status: published` at the database owner seam;
   - admin CRUD;
   - atomic `id + expectedRevision` PATCH using `$inc: {revision: 1}`;
   - return 409 on no matching revision;
   - publish validates required fields, sets stable slug and `publishedAt`;
   - unpublish sets draft and unsets `publishedAt`;
   - delete Guide only; do not delete R2 objects.
5. `src/lib/http.ts`: one small stable error mapper for validation/401/404/409/500; never return stack traces.
6. Add the specified guide API Route Handlers. Every write and admin read starts with `requireAdmin()`.

### Tests

- schema boundaries and three-day itinerary;
- partial unique slug and duplicate rejection;
- public query never returns drafts;
- publish validation and immutable published slug;
- unpublish clears `publishedAt`;
- stale revision returns 409 and preserves the winner;
- unauthenticated write paths fail before repository mutation;
- API errors do not include stack/provider details.

Use a disposable test database name and clean only that database. Do not point tests at an unqualified/shared URI.

### Verification

```bash
docker compose up -d mongodb
npm test -- guides
npm test
npm run lint
npm run build
```

### Commit

```text
feat: implement guide persistence and publication
```

### Rollback

`git revert <phase-3-commit>` and drop only the task-owned disposable test database. The initial additive collection requires no production migration.

## Phase 4 — Public and administrator UI (landing)

### Minimum landing change

A user can complete the real core journey without API tools.

### Steps

1. `/`: list published guides from MongoDB using server components.
2. `/guides/[slug]`: render title, excerpt, cover, itinerary, sections, citations/accessed times, travel-fact freshness warning, and basic OG metadata.
3. `/admin/guides`: protected list showing status and revision.
4. `/admin/guides/new` and `/admin/guides/[id]`: structured editor for all SPEC fields; use native date/time/select/input controls and semantic fieldsets.
5. Provide preview, save, publish, unpublish, delete confirmation, and copy-link actions.
6. On 409, keep the local form values and show a recoverable conflict message; do not silently reload or overwrite.
7. `guide-card.tsx` is a view over Guide data, not a second model.

### Checks

- labels, alt text, keyboard operation, visible focus, heading order, error association;
- mobile layout at a narrow viewport;
- draft URL/metadata cannot be accessed publicly;
- no `dangerouslySetInnerHTML` or unsanitized HTML.

### Verification

```bash
npm test
npm run lint
npm run build
```

Then start the real local app against Docker MongoDB and use the browser tool to verify login → create → publish → public read → unpublish. Do not claim this smoke if it was not actually run.

### Commit

```text
feat: add guide authoring and public pages
```

### Rollback

`git revert <phase-4-commit>`; preserve MongoDB data because the UI does not migrate it.

## Phase 5 — Real Cloudflare R2 upload path (landing)

### Minimum landing change

The production upload route exists once and is used directly by the editor; tests replace only the SDK network call.

### Steps

1. `src/lib/storage/r2.ts`: create the real `S3Client` with R2 endpoint, region `auto`, bucket credentials, and `PutObjectCommand`.
2. Implement image validation with native `Buffer` signatures:
   - JPEG `FF D8 FF`;
   - PNG standard 8-byte signature;
   - WebP `RIFF....WEBP`;
   - declared and actual size `<= 10 MiB`;
   - MIME must match detected signature.
3. `POST /api/uploads`:
   - require admin before reading the body;
   - reject declared oversized bodies early;
   - bounded read and actual-size check;
   - server-generated `guides/<uuid>.<ext>` key;
   - upload with explicit `ContentType` and cache metadata;
   - return only `objectKey` and public URL.
4. Integrate upload into the guide editor; alt text remains required before publish.
5. Never expose R2 access keys to client code or logs.

### Tests

- each valid signature;
- MIME/signature mismatch;
- declared and actual oversize;
- unauthorized request performs no S3 call;
- key is server-generated and path-safe;
- provider error maps to a retryable generic response.

### External smoke gate

Before the first real R2 write, ask for explicit confirmation and require `.env.local` credentials. Upload one small test image under `smoke/`, read back metadata/URL, then delete that exact smoke object. Never list or delete unrelated objects.

### Verification

```bash
npm test -- upload
npm test
npm run lint
npm run build
```

### Commit

```text
feat: add bounded Cloudflare R2 image uploads
```

### Rollback

`git revert <phase-5-commit>`; remove only the recorded smoke object if it exists. Existing Guide image metadata remains intact.

## Phase 6 — Real Gemini Agent path (landing)

### Minimum landing change

Implement the three production Gemini actions directly; the admin UI consumes their validated results and writes nothing until explicit acceptance.

### Steps

1. `src/lib/ai/schemas.ts`:
   - JSON schemas/Zod validation for `GuideCandidate`, `GuideAnswer`, and `AiResult<T>`;
   - `clarification.questions` must be non-empty;
   - exclude id/slug/cover/status/revision/timestamps from candidate output.
2. `src/lib/ai/gemini.ts`:
   - instantiate `GoogleGenAI` with `GEMINI_API_KEY`;
   - use `GEMINI_MODEL` and Interactions API;
   - enable `google_search` and structured `response_format`;
   - implement `generateGuideDraft`, `reviseGuide`, `answerGuideQuestion`;
   - parse/validate JSON;
   - extract response-level grounding annotations and overwrite/assemble `sources` with server access time;
   - bounded timeout, no infinite retry, explicit auth/quota/timeout/provider error categories;
   - no database, publish, delete, upload, or arbitrary tool capability.
3. Add protected AI routes that validate request bodies before provider calls.
4. `ai-assistant.tsx`:
   - loading/success/clarification/retryable failure states;
   - current and candidate content shown separately;
   - only “采纳” copies candidate fields into the editor;
   - saving remains the normal Guide PATCH action.
5. Never persist provider raw responses, prompts, thought traces, or secrets.

### Tests

Mock `@google/genai` only at the network seam while calling the real `gemini.ts` functions:

- candidate and clarification branches for all three actions;
- malformed/schema-valid-but-semantic-invalid output rejected;
- grounding metadata becomes `SourceRef[]` and model-invented source fields are overwritten;
- revise does not mutate its input;
- answer receives only the target Guide and question;
- timeout/quota/auth mapping;
- no database/storage method is imported or callable from the AI module.

### External smoke gate

Before the first paid/remote Gemini call, ask for explicit confirmation and a configured `.env.local`. Run one bounded prompt proving the configured model combines Google Search and structured output. Save only a redacted result summary and source URLs; do not persist prompts containing private itinerary data.

### Verification

```bash
npm test -- gemini
npm test
npm run lint
npm run build
```

### Commit

```text
feat: integrate the grounded Gemini travel assistant
```

### Rollback

`git revert <phase-6-commit>` or remove `GEMINI_API_KEY`/`GEMINI_MODEL` to disable AI while preserving public Guide reads. No database rollback is required until a candidate is explicitly accepted and saved through normal CRUD.

## Phase 7 — Docker and full acceptance (landing)

### Minimum landing change

The documented local stack starts reproducibly with real web and Mongo services.

### Steps

1. Finalize the multi-stage `Dockerfile` and Next standalone output if supported by the pinned version.
2. `docker-compose.yml`:
   - web waits on Mongo health;
   - Mongo binds only as needed for local development;
   - named data volume;
   - environment file referenced but never copied into the image;
   - restart behavior appropriate for local development, not production claims.
3. Update README with exact setup, password-hash generation, `.env.local`, Docker, test, smoke, and shutdown commands.
4. Update project status without claiming deployment or external smoke that did not occur.

### Acceptance run

```bash
npm test
npm run lint
npm run build
docker compose config
docker compose up -d --build
docker compose ps
```

Use real local HTTP/browser checks for:

- published list/detail;
- anonymous denial of admin/API/AI/upload;
- admin login/logout;
- create/edit/reload/publish/unpublish/delete;
- duplicate slug;
- stale revision conflict;
- OG title/description and image alt;
- R2/Gemini features only if their separate external gates were authorized.

Finally:

```bash
docker compose down
git diff --check
git status --short
```

Do not remove the named Mongo volume unless the user separately authorizes data deletion.

### Commit

```text
docs: document and verify the local travel cards stack
```

### Rollback

`git revert <phase-7-commit>`; `docker compose down` stops containers while retaining the data volume.

## Phase 8 — Independent review and closeout (review gate)

1. Freeze the exact candidate:
   ```bash
   git status --short
   git diff --check
   git rev-parse HEAD
   ```
2. Run one independent read-only AGY engineering review over the exact commit range from `aaca9ea` to candidate HEAD, covering:
   - SPEC compliance;
   - auth/session/write-route enforcement;
   - draft leakage;
   - revision and slug semantics;
   - upload limits/credential exposure;
   - Gemini permissions/citations/human acceptance;
   - Docker and rollback claims.
3. Hash scoped files before/after and require `NO_DRIFT`.
4. Parent Hermes verifies every blocker against code/tests/current official docs.
5. Accepted blockers receive one bounded fix and affected checks rerun. Non-blocking suggestions are applied only when they close a real acceptance gap; do not expand the MVP.
6. Final closeout reports:
   - commit hashes;
   - exact test/build/Docker results;
   - whether R2/Gemini real smoke ran or remained blocked by credentials/authorization;
   - remaining dirty files;
   - no deployment/promotion claim.

## Test and requirement matrix

| SPEC area | Primary verifier |
|---|---|
| Public-only published content | repository/API tests + browser anonymous smoke |
| Single-admin boundary | password/auth guard tests + anonymous route smoke |
| Guide aggregate and validation | Zod/model tests |
| Slug/publish/unpublish | repository/API tests + browser smoke |
| Revision conflict | atomic repository test + UI conflict smoke |
| R2 size/MIME/signature/auth | upload tests + separately authorized real smoke |
| Gemini candidate/clarification | Gemini service tests |
| Grounded citations | metadata assembly test + separately authorized real smoke |
| No AI side effects | import/call boundary test + code review |
| Public share/OG/accessibility | build + browser text/DOM inspection |
| Reproducible local run | Docker config/build/health checks |

## Security invariants

1. No admin write or draft read occurs without server-side session verification.
2. Public database queries include `status: published` at the repository owner seam.
3. Passwords, API keys, R2 keys, prompts, and raw provider responses never enter Git, client bundles, logs, or review evidence.
4. AI cannot call persistence, publishing, deletion, upload, arbitrary functions, or user-supplied tool definitions.
5. Candidate data remains separate until explicit acceptance and normal save.
6. Upload authorization happens before body consumption; actual bytes, MIME, and magic bytes are checked before R2 write.
7. Stale revisions fail with 409; they never become last-write-wins.
8. Published slug is unique and stable; drafts may omit it.
9. Provider absence/failure disables only that optional operation and does not falsify public Guide reads.
10. Test cleanup is scoped to task-owned databases/objects only.

## Must not be harmed

- Disabling Gemini or R2 must not make already-published MongoDB guides unreadable.
- A test/review run must not write to real R2, Gemini, shared MongoDB, Hermes active state, or any remote system without the separate explicit gate.

## Plan readiness self-audit

- **No placeholder mutations:** every landing phase names files, code shape, commands, checks, commit, and rollback.
- **No runtime fake path:** production modules call MongoDB/Auth.js/R2/Gemini directly; tests mock only network/provider calls.
- **Bounded dependencies:** one approved list; new packages require a plan/spec amendment or explicit approval.
- **Bounded external calls:** R2/Gemini smoke each has a separate confirmation and one-call/object scope.
- **Rollback:** every phase is a coherent Git commit; Mongo/R2 cleanup is exact and non-destructive.
- **Review proportionality:** one final independent review, rerun only for an accepted blocker that changes the candidate.
- **No active-layer promotion:** implementation stays inside this repository and does not alter Hermes runtime/config/skills/memory/wiki/cron.
- **Open blockers:** real R2/Gemini smoke requires credentials and explicit external-call/write approval, but this does not block local implementation of the final production code path.

===== END PLAN =====

===== FROZEN SPEC =====
# Travel Cards MVP Specification

- **状态**：Implementation-ready / AGY review notes applied / implementation not started
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
- **图片**：Cloudflare R2 S3-compatible API。首版采用同源、服务端中转上传：Next.js Route Handler 先验证管理员、声明 MIME、文件签名与实际字节数，再以服务端凭证写入 R2。上限为 10 MiB，只允许 `image/jpeg`、`image/png`、`image/webp`；object key 由服务端生成。单管理员小图片场景不引入 presigned URL、R2 CORS 或 Worker 上传代理。
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
- 上传 Route Handler 必须在读 body 前拒绝已声明超过 10 MiB 的请求，并在有界读取后再次校验实际字节数；同时校验 MIME 与文件签名一致。object key 由服务端生成，不接受任意路径。
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

===== END SPEC =====
