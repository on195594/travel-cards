# Travel Cards Spec Execution Plan

- **Status:** execution-ready; spec-aligned and proportionality-slimmed
- **Source of truth:** `/home/lin/.hermes/projects/travel-cards/SPEC.md`
- **Baseline commit:** `aaca9ea docs: initialize travel cards project spec`
- **Prior review:** AGY R2 approved detailed-plan hash `6b567bbd…`; this rewrite preserves every accepted engineering fix but supersedes that exact plan hash by removing duplicated process.
- **Boundary:** this plan does not authorize dependency installation, credentials, paid Gemini calls, R2 writes, deployment, or changes outside this repository.

## 1. Goal and minimum landing milestone

Implement the real production path from the first code change:

```text
Next.js App Router
  → Auth.js single-admin guard
  → MongoDB/Mongoose Guide aggregate
  → admin create/edit/publish/unpublish
  → public guide list/detail/share metadata
  → Cloudflare R2 image upload
  → Gemini Interactions generate/revise/answer with grounded sources
```

No runtime fake, demo repository, temporary data store, second Card model, or provider facade with one implementation is allowed. Tests may mock Mongo/R2/Gemini network boundaries while invoking the same production modules.

The first functional milestone is complete only when a real local administrator can log in, save a Guide to MongoDB, publish it, and open `/guides/[slug]` as a visitor. Intermediate commits may land final infrastructure pieces but must not introduce a throwaway path.

## 2. Requirement alignment

| SPEC requirement | Plan owner | Required proof |
|---|---|---|
| Public published list/detail | Phase 1 | repository tests + anonymous browser smoke |
| Draft/admin isolation | Phase 1 | server guard tests + anonymous 401/404 smoke |
| Single-admin Auth.js login | Phase 1 | password/session tests + login/logout smoke |
| Guide CRUD and one aggregate | Phase 1 | Mongo repository/API tests |
| Stable slug, publish/unpublish | Phase 1 | unique-index and transition tests |
| Revision conflict returns 409 | Phase 1 | atomic concurrent-update test + UI conflict smoke |
| Public card/OG/alt text | Phase 1 | build + DOM/metadata inspection |
| Server-mediated R2 images | Phase 2 | validation tests + separately authorized real smoke |
| Gemini generate/revise/answer | Phase 3 | service/API tests + separately authorized real smoke |
| Candidate/clarification union | Phase 3 | schema and UI-state tests |
| Grounding metadata → sources | Phase 3 | annotation assembly test |
| AI cannot publish/write/upload | Phase 3/4 | import/call boundary inspection + final review |
| Docker web + Mongo | Phase 1/4 | `docker compose config` + local health smoke |
| Security/non-goals | All phases | scope diff + final review |

No SPEC requirement is deferred beyond Phase 4. Search, tags, favourites, likes, comments, multiple authors, maps/navigation, bookings, notifications, social publishing, vector databases, multi-model routing, Agent frameworks, autonomous background agents, and automatic R2 orphan cleanup remain out of scope.

## 3. Minimal dependency and file decisions

### Dependencies

Resolve current compatible releases at execution time and pin them in `package-lock.json`:

- Runtime: `next`, `react`, `react-dom`, `mongoose`, `next-auth`, `zod`, `@google/genai`, `@aws-sdk/client-s3`.
- Development: create-next-app TypeScript/ESLint/Tailwind toolchain and `vitest`.

Use Node/Web primitives for password hashing, UUIDs, byte signatures, requests, responses, and styling. Do not add bcrypt, upload middleware, slug libraries, state libraries, component kits, Agent frameworks, SDK wrappers, or Playwright unless a demonstrated blocker requires a plan amendment.

### Owning files

```text
src/auth.ts                                  Auth.js configuration
src/lib/env.ts                               focused server-only env readers
src/lib/password.ts                          scrypt verification
src/lib/db.ts                                cached Mongoose connection
src/lib/guides.ts                            Guide schemas, model, serialization, CRUD
src/lib/http.ts                              shared stable HTTP error mapping
src/lib/storage/r2.ts                        real S3Client/PutObject path
src/lib/ai/schemas.ts                        AI input/output contracts
src/lib/ai/gemini.ts                         real Gemini Interactions path
src/app/api/...                              auth, guide, upload, AI Route Handlers
src/app/admin/...                            login/list/editor UI
src/app/guides/[slug]/page.tsx               public detail
src/components/{guide-card,guide-editor,ai-assistant}.tsx
scripts/hash-admin-password.mjs
Dockerfile
docker-compose.yml
vitest.config.ts
tests/{password,guides,guide-routes,upload-validation,gemini}.test.ts
```

Keep `Guide` in one `src/lib/guides.ts` owner file for the MVP. Split it only if the real file becomes difficult to navigate; do not pre-create schema/model/repository layers.

## 4. Phase ledger

| Phase | State | Deliverable |
|---|---|---|
| 0. Preconditions | not_started | compatible clean environment |
| 1. Real core application | not_started | login → Mongo CRUD → publish → public read |
| 2. R2 images | not_started | real bounded upload used by editor |
| 3. Gemini assistant | not_started | real three-action grounded assistant |
| 4. Acceptance and closeout | not_started | full local proof, one review, aligned docs |

Phases are implementation order, not five approval ceremonies. Continue through local, reversible work after one explicit execution authorization; pause only at the separate R2/Gemini external gates or a stop condition.

## 5. Phase 0 — Preconditions

Read-only checks:

```bash
git status --short
git log -1 --oneline
node --version
npm --version
docker --version
docker compose version
```

Require a clean baseline and Node.js compatible with the current pinned Next.js release (current official minimum: `>=20.9`). Recheck official Auth.js Credentials/JWT, Gemini Interactions structured-search, and R2 AWS SDK v3 APIs before pinning dependencies.

Stop before writes if the repository has unrelated changes, the toolchain is incompatible, a current provider contract contradicts SPEC, or any credential appears in a command line/tracked file/log/prompt.

## 6. Phase 1 — Real core application

### 6.1 Scaffold without overwriting project files

Because the repository is non-empty, run create-next-app in a temporary directory:

```bash
npx create-next-app@latest /tmp/travel-cards-next \
  --ts --tailwind --eslint --app --src-dir \
  --import-alias '@/*' --use-npm --disable-git --yes
```

Inventory the temporary root including dotfiles. Copy only `src/`, `public/`, `package.json`, `package-lock.json`, `next.config.*`, `tsconfig.json`, `eslint.config.*`, and `postcss.config.*`. Merge ignore entries by targeted edit. Never recursively copy the temporary root or overwrite `.git`, `.gitignore`, `.hermes`, `README.md`, `AGENTS.md`, `SPEC.md`, or `docs/`.

Install only the approved packages. Configure scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Set `test.fileParallelism: false` in `vitest.config.ts`; database-owning files and tests must not use `concurrent`.

Keep Cache Components disabled for this MVP. Every page or metadata function that reads MongoDB must be request-time; with the selected rendering model, export `const dynamic = 'force-dynamic'` so `next build` never needs a live database.

Expand `.gitignore` to the SPEC contract: ignore `.env*` and explicitly allow only `.env.example`.

### 6.2 Authentication

- `env.ts`: validate Mongo/Auth eagerly when their operations run; validate Gemini/R2 only when those optional features run.
- `password.ts`: parse `scrypt$<salt>$<digest>` and verify with `crypto.scrypt` + `timingSafeEqual`; malformed values fail closed.
- `hash-admin-password.mjs`: output only the versioned hash; never persist or log plaintext.
- `auth.ts`: Auth.js Credentials provider with JWT session and fixed admin identity.
- Require `AUTH_SECRET` of at least 32 random characters. Generate local ignored configuration with `npm exec auth secret` or `openssl rand -base64 33`; never stage or copy the value into evidence.
- `requireAdmin()` protects every admin page, admin read, write, AI, and upload route on the server. Hiding client buttons is not authorization.
- `/admin/login` uses labeled email/password controls, keyboard submission, and one generic failure message.

Tests: valid/invalid/malformed scrypt, missing configuration, valid session, and unauthorized fail-closed behavior.

### 6.3 Guide persistence and APIs

Implement in `src/lib/guides.ts`:

- Zod contracts for `Guide`, `GuideCandidate`, `GuideAnswer`, and `AiResult<T>`.
- One embedded Mongoose Guide model; serialize `_id` as `id`.
- `revision` starts at 1.
- Partial unique index for defined/non-empty slug.
- Public repository queries always include `status: published`.
- PATCH matches `id + expectedRevision`, applies `$inc: {revision: 1}`, and returns 409 on mismatch.
- Publish validates title/slug/destination/excerpt/cover alt/itinerary, sets `publishedAt`, and freezes slug.
- Unpublish returns to draft and clears `publishedAt`.
- Delete Guide only; never delete R2 objects automatically.

Add the SPEC Route Handlers and stable validation/401/404/409/500 error responses without stack traces. Validate bodies before provider/repository work; authorize before mutation.

```text
src/app/api/auth/[...nextauth]/route.ts
src/app/api/guides/route.ts                 GET public/admin list, POST draft
src/app/api/guides/[id]/route.ts            GET/PATCH/DELETE admin Guide
src/app/api/guides/[id]/publish/route.ts    POST publish
src/app/api/guides/[id]/unpublish/route.ts  POST unpublish
```

Use one task-owned test database name. Because Vitest files run serially, cleanup cannot race; never accept an unqualified/shared Mongo URI and never drop anything except the exact test database.

Tests: schema boundaries, three-day Guide, duplicate slug, draft exclusion, transitions, immutable published slug, 409 preservation, unauthorized no-mutation, and error redaction.

### 6.4 Public/admin UI and Docker

- `/`: published Guide cards from MongoDB.
- `/guides/[slug]`: cover/alt, itinerary, sections, sources/accessed times, freshness warning, copyable URL, and OG metadata.
- `/admin/guides`: protected list/status/revision.
- new/edit pages: structured native controls, preview/save/publish/unpublish/delete confirmation.
- On 409, retain local values and show a recoverable conflict; never overwrite/reload silently.
- No `dangerouslySetInnerHTML` or untrusted HTML.
- Semantic labels, focus visibility, heading order, keyboard operation, and narrow-viewport layout are required.

Add the final multi-stage `Dockerfile`, `.dockerignore`, and Compose `web` + `mongodb` services with Mongo healthcheck, named volume, and no secret baked into the image. Web and Mongo must start locally; stopping containers must not delete the volume.

### Phase 1 checks

Focused tests run while editing. Before the functional milestone commit:

```bash
npm test
npm run lint
npm run build
docker compose config
docker compose up -d --build
docker compose ps
```

Use the browser against the real local stack: login → create a three-day Guide → reload → publish → anonymous public read → unpublish. Also verify anonymous denial, duplicate slug, stale revision, OG metadata, alt text, keyboard flow, and narrow layout.

Stop containers with `docker compose down`; keep the named volume.

Suggested coherent commits (not separate approval gates):

```text
chore: scaffold the real travel cards application
feat: add admin authentication and guide persistence
feat: add guide authoring and public pages
```

Rollback with `git revert` in reverse order. Drop only the exact disposable test database; do not remove the local Mongo volume without separate authorization.

## 7. Phase 2 — Cloudflare R2 images

Implement the production route once:

- `storage/r2.ts`: real `S3Client`, R2 endpoint, region `auto`, configured bucket, `PutObjectCommand`.
- `POST /api/uploads`: require admin before inspecting or consuming the body. Define `MAX_FILE_BYTES = 10 * 1024 * 1024` and `MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 64 * 1024`; reject malformed or declared-over-envelope `Content-Length`, but still stream-read absent or dishonest lengths and cancel immediately above the envelope bound. Parse multipart only from the bounded copy, then independently reject empty files or actual file size over 10 MiB.
- Allow only `image/jpeg`, `image/png`, and `image/webp` and require matching JPEG/PNG/WebP magic bytes.
- Generate `guides/<uuid>.<ext>` server-side; never accept a client path.
- Return only `objectKey` and public URL; never expose access keys/provider details.
- Editor upload uses this route; publish still requires alt text.

Tests mock only the S3 network call: allowed signatures, MIME mismatch, declared/actual oversize, unauthorized zero calls, path-safe key, and generic retryable provider failure.

External gate: before the first real R2 write, obtain explicit confirmation and ignored credentials. Upload one small object under an exact recorded smoke key, verify it, then delete that key. If interrupted, cleanup may delete only the same recorded key—never list/delete by prefix.

Checks:

```bash
npm test -- upload
npm run lint
npm run build
```

Commit: `feat: add bounded Cloudflare R2 image uploads`.
Rollback: revert the commit and remove only the exact smoke object if present; do not alter Guide image metadata or other objects.

## 8. Phase 3 — Gemini travel assistant

- `ai/schemas.ts`: executable schemas for inputs, `GuideCandidate`, `GuideAnswer`, and `candidate | clarification`; questions must be non-empty and candidates exclude id/slug/cover/status/revision/timestamps.
- `ai/gemini.ts`: real `GoogleGenAI` + configured model + Interactions API + `google_search` + structured `response_format`.
- Implement generate/revise/answer with bounded timeout and explicit auth/quota/timeout/provider error mapping; no infinite retry.
- Validate JSON semantically, extract response-level grounding annotations, and overwrite/assemble `sources` with server access time. Never trust model-invented source fields.
- The AI module imports no Guide mutation, publish, delete, upload, or arbitrary function capability.
- Protected AI routes validate input before the provider call.
- UI keeps current and candidate content separate; clarification and retryable failure are explicit; only “采纳” copies candidate fields into the editor, and normal Guide save remains the only persistence path.
- Do not persist raw prompts, provider responses, thought traces, or secrets.

```text
src/app/api/ai/generate/route.ts
src/app/api/ai/revise/route.ts
src/app/api/ai/answer/route.ts
```

Tests mock only `@google/genai` network behavior while calling production functions: three actions and both result variants, malformed/semantically invalid output, citation assembly, input immutability, minimal answer context, timeout/quota/auth mapping, and absence of persistence/storage capability.

External gate: before the first real/paid call, obtain explicit confirmation and ignored credentials. Run one bounded prompt proving the configured model combines Search and structured output; save only a redacted status and source URLs.

Checks:

```bash
npm test -- gemini
npm run lint
npm run build
```

Commit: `feat: integrate the grounded Gemini travel assistant`.
Rollback: revert the commit or remove Gemini configuration; published MongoDB guides remain readable.

## 9. Phase 4 — Acceptance and closeout

Run once after all local code is complete:

```bash
npm test
npm run lint
npm run build
docker compose config
docker compose up -d --build
docker compose ps
```

Browser/API acceptance must cover every row in the requirement alignment table. R2/Gemini real smoke is included only if its separate gate was authorized; otherwise report it as blocked, never as successful.

Freeze the candidate SHA and run one independent read-only AGY review of the exact `aaca9ea..HEAD` range for SPEC compliance, auth/draft isolation, revision/slug semantics, upload limits, credential exposure, Gemini side effects/citations, Docker claims, and non-goal scope. Hash before/after and require `NO_DRIFT`. Parent Hermes verifies findings; rerun review only after an accepted blocker changes the candidate.

Update README with exact setup, password hash, environment, Docker, test, smoke, and shutdown commands. State honestly whether external smoke ran. Then:

```bash
docker compose down
git diff --check
git status --short
```

Commit: `docs: document and verify the local travel cards stack`.

## 10. Invariants and stop conditions

1. Server-side session verification precedes all admin/draft/write/AI/upload access.
2. Public queries filter `published` at the data owner seam.
3. Credentials, plaintext passwords, prompts, raw provider responses, and private data never enter Git, client bundles, logs, or review evidence.
4. AI has no persistence or external-action tools; candidate acceptance is explicit.
5. Stale revision returns 409 and preserves both the saved winner and local editor content.
6. Published slug is unique/stable; draft slug may be absent.
7. Upload auth precedes body handling; actual bytes, MIME, and signature are checked before R2 write.
8. Missing Gemini/R2 disables only that operation and never makes existing public guides unreadable.
9. Tests and cleanup affect only task-owned databases/objects.
10. No Hermes active surface, other project, deployment, remote resource, or external service is changed without its separate authorization.

Stop immediately on unrelated dirty files, secret exposure, unsafe database/object scope, broken auth isolation, provider/API incompatibility with SPEC, or a failing required gate. Fix the owning seam; do not weaken tests, add a runtime fake, or expand scope to make the plan pass.

## 11. Proportionality result

- Five phases instead of nine; only four landing phases.
- Docker implementation is owned once in Phase 1, not added and later “finalized” as a second project.
- Full test/build is run at each externally meaningful landing and once at final acceptance, not after every micro-step.
- One final implementation review; existing spec/plan reviews are not repeated.
- Five coherent implementation/doc commits plus one scaffold checkpoint, not one commit per checklist section.
- No new baseline, roadmap, shadow, migration, release, or governance artifacts.
