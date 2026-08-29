你是 Travel Cards 修订执行计划的独立最终复核员。只审查下方冻结计划；不得读取、创建、修改或删除文件，不得运行命令或调用外部服务。

R1 为 REQUEST_BOUNDED_FIXES，计划已针对以下事项修改：
- 所有数据库页面强制 request-time rendering，并禁止本 MVP 启用 Cache Components；
- Vitest 数据库测试串行；
- 脚手架使用明确 allowlist，避免漏 dotfiles 或覆盖项目文件；
- AUTH_SECRET 生成与运行时校验明确；
- Guide 单聚合合并为一个 owner 文件；
- R2 smoke 中断时仅按精确 key 清理。

请检查这些修复是否真正闭环、是否引入新矛盾，以及计划是否可以直接进入 Phase 0/1。当前官方资料确认 Vitest 支持 `test.fileParallelism: false`；Next.js 在未启用 Cache Components 时支持 `dynamic = 'force-dynamic'`；Auth.js 要求至少 32 字符 AUTH_SECRET。不要重复已被事实纠正的旧意见。

输出必须严格包含：
Verdict: APPROVE_LANDING | REQUEST_BOUNDED_FIXES | BLOCKED_NEEDS_USER_DECISION | NO_ACTION_CLOSE
Blocking findings:（没有写“无”）
Important findings:（没有写“无”）
Minor / nice-to-have:（没有写“无”）
Engineering design points already correct:
Safety boundary assessment:
Overengineering/YAGNI assessment:
Recommended next step:（只给一个动作）

每条 finding 必须有计划锚点、失败场景和最小修复。不要扩展 SPEC 或建议 runtime fake、Agent 框架、多用户、搜索、收藏、第二 Card 模型、向量库或多模型路由。请用中文回答。

===== REVISED FROZEN PLAN =====
# Travel Cards Spec Execution Plan

- **Status:** execution-ready, AGY r1 bounded fixes applied, plan-only artifact
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
│       ├── guides.ts
│       ├── ai/{schemas,gemini}.ts
│       └── storage/r2.ts
└── tests/
    ├── password.test.ts
    ├── guides.test.ts
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

1. Because the repository is non-empty, run create-next-app in a temporary directory with `--disable-git`, then merge an explicit allowlist of scaffold files into this repository while preserving `.git`, `.gitignore`, `README.md`, `AGENTS.md`, `SPEC.md`, `docs/`, and `.hermes/`:
   ```bash
   npx create-next-app@latest /tmp/travel-cards-next \
     --ts --tailwind --eslint --app --src-dir \
     --import-alias '@/*' --use-npm --disable-git --yes
   ```
2. Inventory the temporary root including dotfiles before copying. Copy only `src/`, `public/`, `package.json`, `package-lock.json`, `next.config.*`, `tsconfig.json`, `eslint.config.*`, and `postcss.config.*`; merge required ignore entries into the existing `.gitignore` with a targeted edit. Do not use `cp /tmp/travel-cards-next/*`, and do not recursively copy the temporary root, because the former drops dotfiles and the latter can overwrite project guidance.
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
5. Add `vitest.config.ts` for Node-environment tests and alias resolution. Set `test.fileParallelism: false` so database-owning test files cannot race cleanup; tests inside one file must not opt into `concurrent`.
6. Add `Dockerfile`, `.dockerignore`, and `docker-compose.yml` with `web` and `mongodb`, a named Mongo volume, health checks, and no baked secrets.
7. Keep Next.js Cache Components disabled for this MVP so request-time database pages may use the stable route-segment `dynamic = 'force-dynamic'` contract. If the generated scaffold enables `cacheComponents`, remove that flag before landing Phase 1 rather than mixing two rendering models.
8. Update `.env.example` only with names/placeholders; preserve `.gitignore` secret exclusions.

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
5. Require `AUTH_SECRET` in `.env.example` and runtime validation. During local setup, generate a cryptographically random value of at least 32 characters with `npm exec auth secret` (or `openssl rand -base64 33`) into ignored `.env.local`; never print or stage the value in review evidence.
6. `src/app/api/auth/[...nextauth]/route.ts`: export handlers.
7. Add `requireAdmin()` at the server boundary and use it in every later admin page/write route.
8. Build `/admin/login` with labeled email/password inputs, keyboard submission, generic error text, and no credential logging.

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

1. `src/lib/guides.ts`: keep the single MVP aggregate in one owner file and make the SPEC types executable with Zod:
   - `Guide`, `GuideCandidate`, `GuideAnswer`, `AiResult<T>`;
   - URL/date/day/section constraints;
   - draft vs publish validation;
   - one stable API serialization shape using `id`, never raw `_id`.
2. In the same `src/lib/guides.ts`, define the Mongoose model and repository operations:
   - one embedded `Guide` aggregate;
   - timestamps and `revision` starting at 1;
   - partial unique index on non-empty `slug`;
   - no second Card collection.
   - public list/get query filters `status: published` at the database owner seam;
   - admin CRUD;
   - atomic `id + expectedRevision` PATCH using `$inc: {revision: 1}`;
   - return 409 on no matching revision;
   - publish validates required fields, sets stable slug and `publishedAt`;
   - unpublish sets draft and unsets `publishedAt`;
   - delete Guide only; do not delete R2 objects.
3. `src/lib/db.ts`: cache one Mongoose connection across Next.js reloads; fail clearly on missing/failed URI.
4. `src/lib/http.ts`: one small stable error mapper for validation/401/404/409/500; never return stack traces.
5. Add the specified guide API Route Handlers. Every write and admin read starts with `requireAdmin()`.

### Tests

- schema boundaries and three-day itinerary;
- partial unique slug and duplicate rejection;
- public query never returns drafts;
- publish validation and immutable published slug;
- unpublish clears `publishedAt`;
- stale revision returns 409 and preserves the winner;
- unauthenticated write paths fail before repository mutation;
- API errors do not include stack/provider details.

Use a disposable test database name and clean only that database. Do not point tests at an unqualified/shared URI. Keep database test files serial via `test.fileParallelism: false`; if parallelism is later re-enabled, derive a unique database name per worker before any concurrent execution.

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

1. `/`: list published guides from MongoDB using server components and export `const dynamic = 'force-dynamic'` so `next build` never requires a live database.
2. `/guides/[slug]`: render title, excerpt, cover, itinerary, sections, citations/accessed times, travel-fact freshness warning, and basic OG metadata; mark both the page and database-backed metadata path request-time/dynamic.
3. `/admin/guides`: protected list showing status and revision; every database-backed admin page also exports `const dynamic = 'force-dynamic'`.
4. `/admin/guides/new` and `/admin/guides/[id]`: structured editor for all SPEC fields; use native date/time/select/input controls and semantic fieldsets. Any page that reads MongoDB is request-time only.
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

`git revert <phase-5-commit>`; remove only the recorded smoke object if it exists. If the smoke aborts before normal cleanup, use the exact recorded key with a one-object delete command—never a prefix/list-based cleanup. Existing Guide image metadata remains intact.

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
