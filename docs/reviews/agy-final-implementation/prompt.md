You are the final independent read-only implementation reviewer for Travel Cards.

Repository: /home/lin/.hermes/projects/travel-cards
Exact candidate HEAD: 6a090353b452dc06188d82d53b3317f4d097f0db
Review range: aaca9ea..6a090353b452dc06188d82d53b3317f4d097f0db
Source of truth: SPEC.md; also obey AGENTS.md.

Read-only boundary: do not modify, stage, commit, install, configure, start/stop services, access .env.local, call Gemini/R2, or mutate any database/external system. You may inspect Git-tracked files and git diff/history. Parent evidence already exists for: 45 tests passing, clean lint, production build, Docker image build/Compose health, and local HTTP acceptance for auth, CRUD, publish/unpublish, draft isolation, revisions, duplicate slug, metadata/alt, missing-provider errors, and no real external calls. Do not invalidate this review solely because real Gemini/R2 smoke remains separately gated by explicit approval; report it as pending, not an implementation blocker.

Review the exact range for:
1. direct alignment with SPEC and no non-goal scope;
2. Auth.js single-admin isolation, page redirect, same-origin writes, stable redacted errors;
3. Guide validation, atomic revision behavior, published invariants and stable slug after first publication;
4. bounded R2 auth-before-body, envelope/file/MIME/signature/key rules and no credentials/client paths;
5. Gemini Interactions request shape (`store:false`, Google Search, structured response, timeout/no retry), strict inputs, deterministic clarification, candidate-only/no persistence, source annotations/UTF-8 offsets, redacted failure mapping, and manual-adoption UI;
6. Docker/new-clone behavior and honest docs;
7. accidental secrets or runtime fake paths.

Return exactly one verdict token on the first line:
APPROVE
or
REQUEST_CHANGES_WITH_PATCH_SCOPE
or
BLOCKED_NEEDS_USER_DECISION

Then concise findings. Every blocking finding must cite exact file:line, explain violated SPEC behavior, and give the smallest patch scope. Distinguish separately-gated real provider smoke and nonblocking future hardening. Do not request speculative abstractions, frameworks, migrations, rate limiters, or features outside SPEC.
