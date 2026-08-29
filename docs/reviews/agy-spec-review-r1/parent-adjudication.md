# Parent adjudication — AGY spec review r1

## Reviewer result

- Verdict: `REQUEST_CHANGES`
- AGY status: `SUCCESS`
- Exit code: `0`
- stderr: empty
- Drift: `NO_DRIFT`

## Finding dispositions

1. **Missing typed clarification result — accepted.**
   - Added `AiResult<T>` discriminated union and concrete return types for generate/revise/answer.
   - Earliest blocked milestone: fixture-first implementation.

2. **Claim that Google Search and structured output cannot be combined — rejected as stale/incorrect, boundary clarified.**
   - Google’s current structured-output documentation (last updated 2026-08-26) includes an Interactions API example combining `tools: [{ type: "google_search" }]` with `response_format` JSON schema.
   - Spec now requires the Gemini Interactions API, a model whose official capability table supports both features, and one explicit real-model smoke. It does not weaken grounding or schema validation.
   - Official source: https://ai.google.dev/gemini-api/docs/structured-output

3. **PUT presigned URL cannot enforce application upload size — underlying risk accepted; proposed POST fix rejected.**
   - Cloudflare R2 explicitly does not support presigned POST form uploads. Replacing PUT with POST would make the spec less implementable.
   - MVP now uses a same-origin, server-mediated 10 MiB upload with session, declared length, actual length, MIME, and file-signature checks before writing to R2. This is simpler for one administrator and small images.
   - Official source: https://developers.cloudflare.com/r2/api/s3/presigned-urls

## Important notes applied

- Draft slug is now optional; it becomes required and unique at publish time.
- AI candidate types exclude slug, cover image, status, revision, and timestamps; images remain administrator-owned.
- Published guides now require a cover image with alt text.
- Added optimistic revision checks to prevent silent multi-tab overwrites.

## Deliberately not added

- No diff engine: the first UI may present the current and candidate versions side by side and apply only after explicit confirmation.
- No Agent framework, second Card model, vector database, search, favourites, or multi-user publishing.
