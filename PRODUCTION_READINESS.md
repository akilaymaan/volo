# Production Readiness

## Audit (2026-10-16)

The working baseline is Next.js 16.4, Better Auth, Drizzle, embedded PGlite
locally or external Postgres, Claude structured output, and Sarvam speech.
Eight unit tests pass before changes. The existing Playwright suite covers
signup, interview creation, voice completion, scoring, CSV, and tenant isolation.

### Findings, in priority order

1. Restricted intake accepts a typed allowlisted email without proof of access.
   Email invitations do not exist. Start requests have no rate limit.
2. Duplicate completion checks race: multiple live attempts can be created for
   one email. Response IDs double as bearer credentials and appear in reports.
3. Consent is browser-only. No consent version/time or retention policy exists.
   Response deletion leaves survey comments behind (no foreign key).
4. Turn replay loses the closing flag. Future transcript lengths are accepted.
   Parallel turn requests can spend money before the optimistic write fails.
5. Scoring has no anchored question rubric or evidence validation; edits to an
   interview can change the context used to analyze an existing response.
6. AI recommendations are prominent without explicit human-review warnings.
   There is no candidate comparison or per-account usage/cost ledger.
7. Stale calls are finalized on dashboard visits; analysis uses `after()`,
   not a durable queue. Failed analysis needs an explicit retry.
8. Owner checks already protect recruiter mutations, reports, CSV and recording
   reads. Public interview props are explicitly projected, excluding questions,
   allowlists and private objectives. Keep these boundaries.
9. Auth lacks verified-email onboarding/password recovery. Add these before
   a public commercial launch. Database recordings and single-server PGlite
   are appropriate only at small scale.

## Ordered Implementation

1. Security/lifecycle regression tests, atomic candidate attempt claims, separate
   session credentials, consent records, immutable interview snapshots, replay
   fixes, and cascading deletion.
2. Resend adapter, individual hashed invitation tokens, expiration/revocation,
   resend throttling, delivery error handling, and invitation management.
3. Consistent question rubric, exact candidate evidence, reports with human
   review warnings, and comparison scoped to the same interview and version.
4. Configurable retention/deletion, usage and estimated-cost ledger, production
   configuration documentation, lint/typecheck/build and complete mock E2E.

Each increment must have passing automated tests before being described as
complete. All test databases must be fresh isolated paths. Never run destructive
cleanup against the developer's `.data/pglite` or external database.

## Deferred

Phase 2: resume-aware questions, expiring/revocable report shares, private notes,
templates, CSV invitation imports, funnel analytics.

Phase 3: organizations/RBAC, scoped API credentials and signed webhooks.
Scheduling/ATS and object storage follow demonstrated demand or scale.

## Release Gates

- No real email or paid AI in automated tests; mock transport explicitly enabled.
- Server-side ownership and candidate capabilities tested negatively, including
  cross-account access, revoked/expired invitations, duplicate/concurrent starts.
- Additive migrations preserve historical responses; legacy records must not be
  falsely labeled as having consented or evaluated with the new rubric.
- AI is decision support only. A recruiter changes shortlist/rejection status.
- Document external Postgres, HTTPS, verified email sender, retention execution,
  provider rate configuration, and the remaining durable-job limitation.

## Implemented Increments

### 1. Candidate/security foundation

- Separate SHA-256-hashed, 256-bit candidate session secrets in HttpOnly cookies;
  report IDs alone no longer authorize call mutations. Sessions expire after
  three hours; deleting their response invalidates them immediately.
- Database-backed fixed-window start limits (global, interview and address),
  atomic email attempt claims, and a per-call processing lease.
- Required consent version/time, immutable question/objective/language/duration
  and persona snapshots, correct closing-turn replay and transcript-position checks.
- Completed recordings are write-once. Recording and CSV responses are no-store.
- Additive `0003_production_foundation.sql` backfills claims without removing
  historical duplicates. Existing sessions without the new credential cannot
  resume: deploy between interviews. Historical orphan survey rows are preserved;
  the new feedback FK is NOT VALID for historical rows but enforced for new writes.
  Linked feedback now cascades with response deletion.

### 2. Personal invitations

- `0004_email_invitations.sql` adds hashed invitation links, expiry, revocation,
  send attempts and response linkage. Tokens travel in a URL fragment, not
  server URL paths/query strings. The browser removes the fragment on start.
- Resend transport sends plain text with an idempotency key and a timeout.
  Failures are sanitized. Resending rotates the previous link even if the new
  send fails; the recruiter must retry after the throttle window.
- Admission atomically consumes the invitation and email claim. An invitation is
  bound to its interview and normalized email. Revoking it also blocks an active
  candidate session. Possession of an email link is not identity verification.
- No delivery/open webhooks yet. A provider timeout has ambiguous delivery:
  status is failed, but a valid link that was actually delivered can still work.
- HTTP transport and lifecycle tests use mocks. Live provider compatibility,
  verified sender and deliverability require manual verification; no real mail
  has been sent during implementation.

### 3. Evidence-backed evaluation and comparison

- Versioned 0–4 rubric; stable question IDs; candidate-only, exact transcript
  evidence validation. Missing/invalid evidence yields no question score.
- Overall score is recomputed from assessed questions. Coverage is shown in
  comparison, and absent evidence is not treated as a zero answer.
- Existing assessments remain readable. Re-analysis of a legacy response without
  a snapshot uses the current configuration and is explicitly labeled.
- Human review warnings and manual-only candidate status changes. Evidence
  verification proves that text was said, not that an AI interpretation is correct.

### 4. Retention and account usage

- `0005_usage_and_retention_indexes.sql` adds a per-account provider usage ledger
  and retention indexes. Provider token/cache counts, TTS characters and STT
  bytes are measured. Pricing is explicit configuration, never guessed.
- Missing prices remain unpriced, not free. STT duration-based billing, failed
  requests, automatic SDK retries and fallback costs are not fully metered.
  Ledger errors log an alert but do not discard an interview answer. This is
  observability, not billing reconciliation or a hard spending-cap system.
- New-response expiry is configured per interview. Manual owner-scoped cleanup
  has a preview and browser confirmation. The maintenance endpoint is protected
  by an independent secret and requires explicit deletion enablement.
- Deletion clears application copies and derived cohort insights, not emails
  already delivered or provider-held data. Manage vendor retention/contracts and
  database backups separately. No legal compliance certification is implied.

## Manual Setup

1. Back up production Postgres before deployment. Run migrations explicitly with
   `npm run db` and the direct connection; build/start/dev no longer migrate.
   Use `npm run db:local` for explicit PGlite development setup. See
   [DEPLOYMENT.md](DEPLOYMENT.md) for the separate release process.
2. Use external Postgres for multi-instance/serverless deployment and HTTPS with
   a strong `BETTER_AUTH_SECRET` and explicit `BETTER_AUTH_URL` origin.
3. Set `RESEND_API_KEY` and a verified `EMAIL_FROM`; first test one recipient you
   control after approval. Do not enable `EMAIL_MOCK` or `AI_MOCK` in production.
   Supply an appropriate hiring/privacy contact in your invitation sender and
   recruiting communications.
4. Configure model rates in `ANTHROPIC_PRICING_JSON` (USD per million tokens for
   `input`, `output`, `cacheRead`, `cacheWrite`) keyed by actual returned model IDs.
   Optionally configure `SARVAM_TTS_USD_PER_MILLION_CHARACTERS`. Verify estimates
   against provider invoices; do not use them as invoices.
5. Generate an independent `RETENTION_CRON_SECRET` (32+ random characters).
   Schedule POST `/api/maintenance/retention` daily with
   `Authorization: Bearer <secret>` and JSON `{"dryRun":true}` first.
   To actually erase expired data, explicitly set `RETENTION_ENABLED=1` and
   change the request to `{"dryRun":false}`. This action is irreversible.
   Never expose this secret in browser code or untrusted logs.
6. Use WAF/proxy abuse controls in front of the app. Application limits are
   coarse shared fixed windows; they are not a replacement for IP/tenant quotas,
   verified recruiter onboarding or account billing limits.

## Verification

- `npm test`: unit tests and in-memory PGlite integration/migration tests, no
  real AI calls, emails or existing-database deletion.
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm run test:e2e`: production-server signup, creation, candidate voice call,
  analysis, recording, CSV, invitations UI, comparison, privacy UI and negative
  access tests. AI and email are mocked; every run creates a new database.
- Optional isolated build: set `NEXT_BUILD_DIR=.next-verify`,
  `DATABASE_MODE=postgres`, `DATABASE_URL=` and `AI_MOCK=1` for build.
  Use the same `NEXT_BUILD_DIR` for typecheck/E2E. `E2E_PORT` chooses a free port.
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to an already-installed Chromium;
  otherwise install the revision required by Playwright (network permission).
- Generated test databases are intentionally not automatically removed. Delete
  only known test directories yourself after inspection; never delete `.data/pglite`.

## Remaining Production Risks

- Analysis still runs in `after()`, not a durable worker. Pending jobs can fail
  across restarts/timeouts; explicit re-analysis is available and processing is
  claimed atomically. Add a durable queue before promising delivery SLAs.
- Stale sessions are finalized on dashboard access, now including empty attempts
  and honoring the original per-session duration. Partial/empty sessions count
  as completed lifecycle records, not proof of an adequately completed interview.
- Legacy orphan feedback survives until its interview is deleted; legacy
  responses need an explicit retention policy rather than retroactive erasure.
- Email verification/password recovery and organization/team access remain future
  work. Candidate/public auth is not an identity-verification system.
- Cross-site iframe embeds may block SameSite session cookies. Prefer top-level
  personal links. Recordings remain database-backed; enforce hosting payload
  limits, encryption/backups and deploy object storage when scale requires it.
- Provider documentation lookup and live email/AI smoke testing require separate
  network/side-effect approval. All automated provider interactions are mocked.
- Phase 2 personal templates and interview duplication are implemented (see below).
  Other deferred Phase 2 and Phase 3 features are not yet implemented.
- Comparison currently supports one interview/version, not cross-interview role
  grouping. External managed Postgres and live providers need a staging smoke
  test before a production launch.

## Changed File Groups

- Schema/migrations: `src/lib/db/schema.ts`, `drizzle/0003_production_foundation.sql`,
  `drizzle/0004_email_invitations.sql`, `drizzle/0005_usage_and_retention_indexes.sql`,
  their three generated snapshots and `drizzle/meta/_journal.json`.
- Security/lifecycle: `src/lib/security.ts`, `rate-limit.ts`, `privacy.ts`,
  `errors.ts`, `call.ts`, `data.ts`, `format.ts`, `src/app/actions.ts`,
  all five `src/app/api/call/*/route.ts`, the recording/export/voice-preview routes,
  `src/app/i/[id]/page.tsx`, and `src/components/call/candidate-call.tsx`.
- Invitations: `src/lib/mail.ts`, `src/lib/invitations.ts`,
  `src/components/invitation-manager.tsx`, interview dashboard/editor/share UI,
  and `src/app/dashboard/interviews/[id]/edit/page.tsx`.
- Assessment/comparison: `src/lib/evaluation.ts`, `comparison.ts`,
  `src/lib/ai/prompts.ts`, `tasks.ts`, the candidate report and new compare page.
- Usage/retention: `src/lib/usage.ts`, `retention.ts`, AI provider adapters
  (`claude.ts`, `sarvam.ts`), the maintenance route, new usage page,
  `src/components/retention-controls.tsx`, and navigation.
- Tests/tooling/docs: seven new test files under `src/lib/__tests__`,
  `e2e/flow.spec.ts`, `playwright.config.ts`, `next.config.ts`,
  `eslint.config.mjs`, generated Next TypeScript includes in `tsconfig.json`,
  `.gitignore`, `.env.example`, `README.md` and this plan.
- The pre-existing `package-lock.json` change from dependency installation is
  preserved. No new package dependencies, commits, deployment or existing-data
  cleanup are part of these increments.

## Phase 1 Local Verification (Before Deployment Separation)

- PASS: 33 unit/integration tests across 9 files.
- PASS: 11 Chromium Playwright tests against the production build, including
  the original voice journey and owner-isolation checks.
- PASS: ESLint, Next route generation/TypeScript, production build, and
  `git diff --check` (only Windows line-ending notices).
- Windows / Node 24.13.0; isolated `.next-verify` build and fresh PGlite databases.
  Port 3217 avoided an existing service on port 3100. The installed Chromium
  1234 executable was supplied explicitly because Playwright's expected 1248
  browser revision was absent; no browser download was performed.
- The expanded suite initially hit the authentication login throttle. Tests now
  reuse the recruiter session after verifying the first real sign-in; production
  authentication limits were not relaxed.
- Real Resend delivery and paid AI were not invoked. External Postgres was not
  tested. These results are local verification, not a production release signoff.

## Personal Templates and Duplication (2026-10-18)

- Interview **More actions** offers **Duplicate interview** and **Save as template**.
  Duplicates open a new, unsaved editor for review; saving creates an independent
  interview. The **Templates** library supports reuse and confirmed deletion.
- Migration `0006_interview_templates.sql` is additive. Apply it explicitly using
  the existing migration process before using templates in an existing database.
  Verification only migrates disposable databases, not the developer's data.
- Templates snapshot reusable settings and preserve restricted intake. Recipient
  allowlists, invitations, results, recordings and cached insights are excluded.
  Templates survive source interview deletion; their deletion leaves interviews
  already created from them intact. Deleted custom interviewers require a new
  selection in the editor. Templates are personal, with server-side owner checks
  on every read and mutation.
- PASS: 51 unit/integration tests; four real-PostgreSQL tests remain skipped locally.
- PASS: all 14 Chromium browser tests against the production build, including
  template snapshot independence, duplication, cross-account denial and deletion.
- PASS: lint, production compilation/TypeScript, migration upgrade/idempotency,
  and desktop/mobile template-library visual inspection (390px mobile, no overflow).
- Test AI and email remain mocked. Subsequently, at the user's request, migration
  `0006` was applied to the configured Neon database over a direct TLS connection.
  Verification confirmed seven migration entries, the new table and index, and
  unchanged interview, response and recording counts. Runtime connection settings
  were not changed. No application deployment was run.
