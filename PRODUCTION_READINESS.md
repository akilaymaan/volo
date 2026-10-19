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
   control after approval. Production always uses real provider integrations.
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
- `npm run test:e2e:build` then `npm run test:e2e`: isolated-test-server signup, creation, candidate voice call,
  analysis, recording, CSV, invitations UI, comparison, privacy UI and negative
  access tests. AI and email are mocked; every run creates a new database.
- Optional isolated build: set `NEXT_BUILD_DIR=.next-verify`,
  `DATABASE_MODE=postgres`, `DATABASE_URL=` for build.
  Browser tests use their own `.next-e2e` build. `E2E_PORT` chooses a free port.
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
- Phase 2 personal templates, interview duplication and CSV invitation imports
  with manually triggered reminders are implemented, along with audio-linked
  transcript review (see below).
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

## Bulk Invitations and Manual Reminders (2026-10-18)

- The Invitations tab accepts bounded UTF-8 CSV imports: max 100 KB, 100 recipients
  and 20 columns. An `email` header is required; `name` is optional and shown only
  for review. The parser handles BOMs, quoted commas/newlines and escaped quotes.
- Authenticated, owner-scoped previews flag invalid/duplicate emails, existing
  invitations, attempt claims and allowlist restrictions. Previewing never creates
  invitation records or sends email. Every send rechecks server-side eligibility.
- Confirmation starts sequential, bounded per-recipient requests with individual
  results. Cancelling stops after the in-flight recipient. Leaving the page stops
  remaining sends. Network ambiguity stops the batch and is never automatically
  retried. New-import sends atomically refuse existing invitations, even after a
  lost response or concurrent submission; they cannot silently rotate old links.
- Manual reminders require an accepted, unexpired, non-revoked invitation and no
  candidate attempt. The atomic update enforces a 24-hour wait and a maximum of
  three total send attempts, including the initial send and failures. Reminders
  rotate the personal link and explain this in the email. The original explicit
  Resend action remains available for recruiter-directed recovery.
- The existing 100 account send attempts/hour limit applies to all send modes.
  Provider failures are sanitized. Accepted means provider acceptance, not delivery.
- No new schema, migration, scheduler, durable queue or automatic reminders.
  Keep the browser open while sending; refresh preview and inspect invitation
  status before retrying an unconfirmed send. This is not a background bulk job.
- PASS: 67 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 17 production-build Chromium tests, including bulk sending, invalid/
  duplicate/existing recipients, cancellation, cooldown and network ambiguity.
- PASS: lint, production compilation/TypeScript, and desktop/mobile visual review.
  Mobile controls were adjusted after review; affected browser flows rechecked.
- Email and AI were mocked and all test databases disposable. No live email was
  sent, no Neon data changed, and no commit, push or deployment was performed.

## Audio-Linked Transcript Evidence (2026-10-18)

- New browser recordings capture interviewer playback and candidate answer-segment
  offsets against the mixed recording's audio clock. Server transcription/write
  times are never treated as audio positions. Saved-but-lost turn replies still
  associate the captured answer with its original transcript index.
- The recording upload accepts bounded, versioned timing metadata with finite
  integer offsets, ordered unique transcript indices and duration checks. Bytes
  and cues are saved in one transaction and are write-once together. Replayed or
  concurrent uploads cannot replace audio or retime an existing recording.
- Candidate reports offer keyboard-accessible timestamp buttons, audio seeking
  from question-evidence links, and highlighting of the turn at the playhead.
  Audio controls wait for metadata/duration discovery, including recorder WebM
  files without an initial duration. Source blob URLs are revoked on cleanup.
- Historical recordings without captured positions retain plain transcript links
  and normal playback. Failed audio loads keep the transcript readable and disable
  audio shortcuts. No guessed historical timestamps or word-level alignment.
- Positions are approximate turn starts, including thinking pauses. Browser
  buffering can shift alignment. Candidate-supplied cues are navigation aids,
  not scoring or integrity evidence; transcript text and indices are unchanged.
- No schema migration or new dependency. The optional offset is stored inside
  the existing transcript JSON alongside its recording. Neon data was not changed.
- PASS: 78 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 19 production-build Chromium tests, including real browser recording,
  a simulated lost turn reply, timestamp/evidence seeking, active highlighting,
  missing timing metadata, recording-load failure and account isolation.
- PASS: lint, TypeScript, production build, whitespace check, and desktop/mobile
  visual inspection (390px mobile without horizontal page overflow).
- AI/audio-provider responses and email were mocked; live voice alignment on
  Safari/mobile devices still needs a staging check. No commit, push or deployment
  was performed during feature implementation.

## Production Demo/Mock Removal (2026-10-18)

- Removed runtime AI/email mock switches, scripted questions and assessments,
  canned transcription, silent speech output, and fake email-success responses.
  Missing provider credentials now fail instead of returning synthetic results.
- Removed the landing page's simulated live interview and sample CSV recipients.
  The downloadable invitation CSV contains headers only. Real voice previews,
  reusable interviewer configurations and existing customer records are retained.
- Automated provider doubles live under `e2e/stubs`, outside application source,
  and are selected only by an explicit `.next-e2e` test build. Ordinary production
  builds contain no aliases. The test-build guard rejects other output folders
  and Vercel/Render environments. The Docker runtime copies production output and
  dependencies only, not test source or local test builds.
- PASS: 80 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 19 isolated-build Chromium tests, including the full candidate/report
  flow, header-only CSV template and landing-page desktop/mobile layout checks.
- PASS: production build, TypeScript, lint and production-bundle marker scan.
  Regression tests verify that obsolete mock flags cannot bypass real providers.
- No live AI requests or email sends were used for verification. Disposable local
  databases were used; Neon data was not changed. Docker execution and live-provider
  staging checks were not performed. No commit, push or deployment was performed.

## Bulk Candidate Review (2026-10-18)

- The Candidates tab supports individual checkboxes and Select shown (first 100
  when more results are visible), a selected count and Clear selection. Search or
  status-filter changes clear selection; sorting preserves it. Hidden results are
  never included in a batch. The mobile row layout preserves readable identities.
- Choose Shortlisted, Maybe, Rejected or Not reviewed, then Review selection.
  A confirmation lists candidate names/emails and the destination status. Cancelling
  changes nothing. Pending updates disable selection and submission controls.
- The server authenticates every action and validates unique, bounded selections
  of 1–100 completed responses belonging to one owned interview. A transaction locks
  the interview and responses, compares statuses captured at selection, and changes
  only review statuses. A missing, foreign, unfinished or stale response rejects the
  entire batch. Conflicting batches cannot both overwrite the same expected statuses.
- Scores, transcripts, recordings, viewed flags and invitation records are unchanged.
  AI is not consulted, and no emails are sent. Existing single-report review and
  candidate comparison remain available. These are manual advisory review decisions.
- Successful actions refresh the interview and report pages. Failed or unconfirmed
  requests clear selection; network ambiguity prompts a refresh/check before retrying.
  No automatic retry or background batch is used. Expected statuses are not a full
  history/audit log: changes that return to the same status cannot be distinguished.
- PASS: 93 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 22 isolated-build Chromium tests, including cancellation, filter-safe
  selection, persistence, a second-tab conflict and a saved-but-lost update reply.
- PASS: production build/TypeScript, lint, whitespace check and desktop/mobile
  visual review, including the confirmation dialog and 390px overflow checks.
- No schema migration or new dependency. Verification used disposable local
  databases and isolated test-only provider doubles. No live Neon data changed,
  real AI requests, email sends, commit, push or deployment were performed.

## Invitation Email Failure Diagnostics (2026-10-18)

- The reported toast was a generic catch-all for missing configuration, provider
  rejection and ambiguous delivery failures; it did not identify the live cause.
  The local `.env` has no Resend key/sender. Live Vercel configuration and Resend
  domain verification could not be inspected without a connected deployment account.
- Email setup now validates nonempty trimmed RESEND_API_KEY and EMAIL_FROM, a valid
  sender address/display-name format, and absence of header newlines. Missing or
  malformed setup is rejected before send-attempt/rate-limit writes or token rotation.
- The owner Invitations tab shows actionable setup guidance and disables single,
  resend and bulk-send controls while local configuration is invalid. CSV previews
  and revocation remain available; no secret configuration values are serialized.
- Resend failures map to safe, actionable categories: key/permission, restricted
  test sender, unverified sender domain, quota, rate limit, temporary outage and
  unconfirmed transport/response. Raw provider bodies, addresses and tokens are
  neither returned nor logged. Server logs contain only invitation ID, safe category
  and HTTP status. Unknown failures retain the conservative generic fallback.
- No provider acceptance is fabricated, no automatic send retry was added, and
  accepted still does not mean delivered. Network ambiguity requires checking the
  invitation/provider status before a manual resend after the cooldown.
- PASS: 112 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 22 isolated-build Chromium tests, production build, TypeScript, lint
  and whitespace checks. New tests cover provider categories, privacy, missing
  configuration, existing-link preservation and setup warning/control rendering.
- No schema migration, live email, live Neon data changes, commit, push or deployment.
  Production delivery still requires valid server-side credentials and a verified
  Resend sender domain, followed by a redeploy and an approved real-email check.

## Completed Recording Upload Recovery (2026-10-19)

- Completed mixed audio and its captured timeline are saved to a bounded IndexedDB
  store before upload. No candidate name/email, transcript text or session token
  is persisted. Up to three unexpired copies of at most 25 MB each are retained;
  concurrent saves cannot silently evict older pending recordings. Unavailable,
  corrupt, blocked, full or quota-limited storage falls back to a visible in-tab
  copy with a warning not to close/refresh before upload or download.
- The completion screen shows preparation, finalization, upload progress and server
  confirmation separately. Feedback no longer implies recording upload succeeded.
  Temporary network/408/425/429/5xx failures receive at most two automatic retries
  per attempt; offline attempts pause and enabled recovery resumes on reconnect.
  Requests have bounded timeouts and abort when the recovery card unmounts.
- Every attempt first checks a no-store candidate-only acknowledgement endpoint.
  Saved-but-lost replies are resolved without re-uploading bytes. Finalization is
  idempotent, and the existing write-once audio/cue transaction remains unchanged.
  Missing/expired candidate cookies, revoked invitations, deleted responses,
  expired upload permission and permanent host/type/timing errors cannot be bypassed.
- `/recording-recovery` restores pending copies without requiring a new interview
  or accepting new candidates. It works when intake is paused, subject to original
  session permission. Restored copies require explicit retry. The candidate intro
  shows a pending-copy notice. Navigation links are hidden while connecting/live.
  Cards identify copies by preparation time and a short response reference.
- Confirmed uploads remove the local copy; cleanup failure is reported explicitly.
  Candidates may download or confirm removal of a local copy without deleting
  server interview data. Downloads are user-managed and not automatically deleted.
  Expired/invalid records are removed on recovery access, or at expiry while their
  card remains open. No worker uploads or deletes browser data while the page is closed.
- The existing three-hour permission window is not extended. Local preparation
  must finish before refresh/close; this is not mid-call crash recovery or live-call
  resume. Browser eviction, cleared storage/cookies, another browser/origin, private
  browsing and device/network restrictions can prevent recovery. Vercel's 4.5 MB
  request limit still applies; size rejections offer download rather than endless retry.
- New consent uses version `2026-10-19-v2` and explains temporary browser storage,
  expiration and cleanup. Historical consent records are untouched. No schema
  migration, new dependency, live Neon changes, paid-provider call or live email send.
- PASS: 130 unit/integration tests; four real-PostgreSQL tests skipped locally.
- PASS: all 25 isolated-build Chromium tests, including bounded failed uploads,
  IndexedDB refresh recovery, offline/reconnect, saved-but-lost acknowledgement,
  expired/invalid copies, missing credentials, download/discard, unavailable/full
  storage and permanent host-size rejection. Recovered reports retain audio and cues.
- PASS: production build, TypeScript, clean lint, whitespace check, production
  bundle test-marker scan and desktop/390px-mobile recovery-page visual review.
- Browser/device-specific Safari/iOS storage and network behavior still needs
  staging validation. No commit, push or deployment was performed.

## Recruiter Review Inbox (2026-10-20)

- Added `/dashboard/inbox` and dashboard/sidebar links. Completed responses are
  grouped by unopened reports, missing decisions, failed/stalled analysis and
  missing recordings. Counts overlap; the all-attention count is unique responses.
- Owner-scoped metadata queries exclude transcripts, analytics, audio and tokens.
  Loading, refreshing and filtering the inbox never marks reports viewed or starts
  analysis. Report/interview link prefetch is disabled to avoid destination effects.
- Interview, decision and inclusive UTC-date filters use validated query parameters.
  Stable newest-first pagination shows 25 rows per page, capped at page 1,000.
- Failed/stalled completed analyses can be explicitly retried after a cost-warning
  confirmation. Authentication, ownership, the shared analysis rate limit and an
  atomic state check guard queueing. Fresh pending/running analyses cannot be
  requeued. Queue acceptance is not reported as successful analysis completion.
- Missing recording flags distinguish the three-hour recovery window from older
  missing recordings. Recovery still requires the candidate's original browser
  and existing permission; the inbox cannot recover audio from another device.
- PASS: 144 unit/integration tests and all 27 isolated-build Chromium tests,
  including account isolation, read-only navigation, filters, retry confirmation,
  queue failure handling and existing recording recovery flows.
- PASS: production build, TypeScript, lint, whitespace checks, production bundle
  test-marker scan and desktop/390px-mobile inbox and confirmation visual review.
- Four real-PostgreSQL tests remain skipped locally. The optional loopback-only
  PostgreSQL deployment suite now also exercises inbox queries and retry queueing.
- No migration, new dependency, live Neon change, paid-provider request, live email,
  commit, push or deployment was performed. Live-provider/staging checks remain
  separate from the isolated local verification.

## Reference Dashboard UI Integration (2026-10-20)

- Recreated the supplied desktop composition with a black collapsible sidebar,
  connected nested navigation, gradient workspace avatar, white content panel,
  compact Geist typography, quick actions, account menu and thin bordered cards.
  Existing routes, authentication, candidate flow and review features are retained.
- Added read-only, owner-scoped monthly completed-interview counts and mutually
  exclusive human-decision distribution. Summary metrics show average completed
  duration, completion rate, successfully analyzed average score and active roles.
  Empty data stays empty; unavailable averages use a dash, never sample figures.
- Inclusive UTC response-date filters default to twelve calendar months through
  today and accept bounded custom ranges. Literal interview-name and live/paused
  filters apply to aggregates and listings. Listing response totals remain all-time.
  Invalid/repeated filter parameters are rejected without broadening the query.
- Quick actions search existing pages and owned interview names with Ctrl/Cmd+K.
  Chart menus offer an accessible data table and CSV export. Account sign-out,
  theme switching, workspace navigation, sidebar collapse and mobile menus work.
  Navigation avoids prefetch-triggered report/reanalysis side effects.
- Kept styles scoped to the dashboard; public/candidate screens retain their theme.
  Corrected the existing Turbopack Tailwind rule to exclude CSS Modules, preserving
  Next's scoped class exports. No dependency or schema migration was added.
- PASS: 150 unit/integration tests; four optional real-PostgreSQL tests skipped
  locally. Tests exercise UTC boundaries, partial/empty months, ownership, literal
  search escaping, statuses, valid-score aggregation and read-only behavior.
- Desktop geometry is browser-asserted at 1600x1200: 191px sidebar and chart at
  (291,259), 358px tall. Desktop, dark-mode and 390px mobile screenshots were visually
  compared/refined; actual chart values intentionally differ from reference data.
- PASS: all 29 isolated-build Chromium tests, including dashboard search/filtering,
  chart table/CSV, theme and sidebar controls, mobile navigation, account sign-out
  and existing interview, recording recovery, report, template and inbox flows.
  Production build, TypeScript, lint, whitespace and production test-marker scans
  also pass. Browser checks use a disposable local database, not production Neon.
- No live Neon data changes, paid-provider calls, live email, commit, push or deploy.

## Edge-to-edge Shared Reference Theme (2026-10-20)

- Removed the reference image's presentation frame: no gray outer canvas, viewport
  padding, outer rounded shell or inner black frame. The black sidebar starts at
  the viewport's top-left; the main panel reaches the right edge. Normal document
  scrolling replaces the constrained, scrollbar-hidden inner panel.
- Moved the neutral palette and Geist typography to the root theme, including
  portaled dropdowns, dialogs, notifications, forms, authentication and candidate
  screens. Removed hard-coded teal auth/editor surfaces and candidate action colors.
  Saved interview/persona branding and meaningful chart/status colors are preserved.
- Light mode is the default under the new `volo-reference-theme` preference key,
  so legacy system/teal dark-mode preferences no longer override the reference.
  Explicit dark-mode selection remains available and uses neutral gray surfaces.
- Standardized shared corner radii and compact dashboard headings. Tests assert
  sidebar bounds (0,0,191,1200), chart origin (215,129), full-width content and actual
  light/dark menu colors, rather than matching minified CSS spelling.
- New interview branding defaults to black; existing saved branding and all prior
  optional color choices remain intact. The editor preview is browser-asserted black.
- PASS: 150 unit/integration tests, all 30 isolated-build Chromium tests, production
  build, TypeScript, lint, whitespace and production test-marker checks. Four
  optional real-PostgreSQL tests were skipped locally. Cross-page screenshots cover
  inbox, interviewers, templates, usage, editor, interview and report screens.
- Local development remains available on port 3000. No migration, live Neon data
  change, paid-provider request, commit, push or deployment was performed.

## Dashboard Branding and Interaction Responsiveness (2026-10-20)

- Added the existing Volo logo and wordmark to the desktop sidebar's top-left and
  mobile header/drawer; collapsed navigation retains an accessible icon-only logo.
  Explicit black mobile-header styling keeps the white wordmark readable.
- Added short button press/color transitions, sidebar collapse transitions and
  immediate navigation pending feedback. Reduced-motion preferences disable motion.
  No artificial waits, optimistic paid operations or fabricated success were added.
- Read-only dashboard destinations preload on hover/focus under an explicit
  allowlist. Reports, finalizing interview pages, exports and query-driven editors
  are excluded. Four safe route loading boundaries and a keyed home-page Suspense
  fallback preserve an interactive shell while content loads. Dynamic detail pages
  retain their authorization/not-found checks before streaming.
- Interview-name lookup no longer blocks the dashboard shell; quick-action search
  streams those results independently with loading/error feedback. Authentication
  checks are deduplicated with React cache within a render, never cached globally.
- Dashboard/inbox GET filters use Next Form for client-side navigation and pending
  submit feedback, retaining native validation and no-JavaScript form behavior.
  Stretched interview-row click targets and explicit confirmation/rate-limit guards
  remain intact. Network/database/provider completion is not guaranteed instant.
- PASS: 152 unit/integration tests and all 31 isolated-build Chromium tests;
  four optional real-PostgreSQL tests skipped locally. New tests verify the safe
  preload allowlist, top-left/collapsed/mobile branding, visible click feedback and
  working menus with a deliberately blocked navigation response, reduced motion,
  same-document filter submission and readable black mobile-header contrast.
- PASS: production build, TypeScript, lint, whitespace/test-marker checks and
  desktop/mobile visual review. Existing report-view flags, account isolation,
  dynamic-detail 404 checks, guarded retries and recording recovery still pass.
- Local dev remains on port 3000. No migration, production Neon data changes,
  live provider/email checks, commit, push or deployment were performed.

## Sidebar Account Controls (2026-10-20)

- Replaced the bottom-left workspace selector with the authenticated user's name,
  email and initials avatar. Its upward-opening menu retains dark-mode switching,
  usage/privacy navigation and guarded sign-out. Removed the top-right account
  dropdown and all workspace-specific UI; the header retains Quick actions only.
- The collapsed sidebar exposes the same menu through its initials avatar. Mobile
  navigation includes the same account controls at the bottom of the drawer.
  Sign-out failures show a safe error toast and restore the ability to retry.
- PASS: 152 unit/integration tests and all 32 isolated-build Chromium tests,
  production build, TypeScript, lint and whitespace checks. Four optional real-
  PostgreSQL tests skipped locally. New browser assertions cover footer bounds,
  removal of the header/workspace controls, upward positioning, collapsed access
  and mobile theme switching; real local sign-out remains covered end-to-end.
- Desktop/mobile menu screenshots were visually reviewed. No schema migration,
  live Neon changes, live provider/email checks, commit, push or deployment.

## Dashboard Navigation Latency (2026-10-20)

- Changed the safe-route allowlist to fully preload visible links in production,
  rather than waiting for hover/focus. Unsafe report/detail/export/query-driven
  editor destinations remain excluded. No global authentication/data cache added.
- Usage totals, recent activity and retention counts run concurrently. Retention
  dry runs now use one aggregate query instead of two sequential identity loads;
  owner scope, null dates and per-interview retention boundaries are tested.
  Explicit deletion and its transaction remain unchanged.
- Read-only real Neon connection benchmark: initial connection/select 3453 ms;
  subsequent selects 302–313 ms. This latency can still affect initial visits.
- Added `npm run preview`: an optimized real-provider build/server in isolated
  `.next-preview`, no migrations, with optional PORT. Stopped the verified project
  development server and started this preview at http://localhost:3000. Development
  mode remains available, but lacks production link preloading and compiles on demand.
- PASS: 154 unit/integration tests, 33 Chromium tests, optimized production build,
  TypeScript, lint and whitespace checks.
  Four optional loopback PostgreSQL tests skipped. Browser benchmark blocks new
  target requests after preloading and asserts actual content, not a loader:
  Templates 143 ms, Interviewers 165 ms, Usage/privacy 170 ms; zero extra requests.
  These timings use the isolated test database, not live authenticated Neon data.
- Real-provider preview sign-in returned HTTP 200; unauthenticated dashboard
  correctly returned HTTP 307. Production JS contains no test-provider markers.
- No schema migration, live Neon writes, live AI/email checks, commit, push or
  deployment. Preview does not hot-reload; restart its build after source changes.

## Interactive Authentication Sphere (2026-10-20)

- Replaced only the authentication-page gray blob with a silver/glass sphere,
  fine SVG contours, a restrained orbit and slowly rotating reflections. Shared
  interview/persona VoiceOrb audio behavior is unchanged; no dependencies added.
- Mouse movement shifts the sphere by at most 12/10 pixels and moves the lighting,
  without React re-renders. Pointer leave/cancel restores its neutral position.
  Touch input is ignored. The decoration is hidden from assistive technology and
  is not focusable or clickable; sign-in/sign-up forms are unchanged.
- Honors live reduced-motion preference changes. Ambient CSS animation pauses
  when the component is offscreen or the document is hidden, and stays inactive
  on small screens where the auth artwork is hidden. Observers/listeners clean up.
- New browser checks cover cursor tracking/reset, form availability, both auth
  routes, mobile overflow/hidden artwork, live reduced-motion and touch behavior.
  All 35 Chromium tests pass. Desktop/mobile screenshots visually reviewed.
  Production build, TypeScript,
  lint and whitespace checks pass. Optimized localhost preview rebuilt; sign-in
  returns HTTP 200. No migration, live provider calls, commit or push.

## Admin-only Usage and Separate Recruiter Privacy (2026-10-20)

- Moved usage to `/dashboard/admin/usage`, aggregating recorded activity across
  accounts for platform administrators only. The server-side data-access function
  authenticates and authorizes before querying the ledger. Recent activity is
  explicitly projected and limited to 100 rows; no candidate response IDs returned.
- Added server-only `ADMIN_USER_IDS`, a comma-separated exact account-ID allowlist.
  Empty/unset denies everyone. No email matching, signup promotion, client-supplied
  role, global auth/usage cache or database migration. Configure IDs on the server
  and restart/redeploy. Account IDs are visible to their owner on the privacy page.
- Normal recruiter navigation, account menu and Quick actions show only Privacy
  and data retention, never API usage. Admin links are conditional and not
  prefetched. Provider setup diagnostics in the shared shell are admin-only.
- `/dashboard/privacy` retains account-scoped aggregate expiry previews,
  retention guidance and explicitly confirmed cleanup through the existing scoped
  server action. Privacy remains safely preloadable. No usage query on this page.
- The old `/dashboard/usage` route is also guarded: non-admin document requests
  return 404; admins redirect to the new page. Removed its streaming loader so
  document denial occurs before streaming. RSC and metadata-only prefetch responses
  are checked for absence of ledger data (Next may return a protocol 200).
- PASS: 159 unit/integration tests; four optional loopback PostgreSQL tests skipped.
  Coverage includes default denial, exact IDs, anonymous/recruiter denial before
  any ledger query, permission revocation, all-account totals, unpriced activity
  and bounded recent rows. Existing owner-scoped deletion/cascade tests still pass.
- Added disposable-database browser fixtures for a real password-authenticated
  admin and cross-account ledger rows. Fixture seeding is guarded to E2E builds
  with an isolated `.data/e2e-<UUID>` PGlite directory and no PostgreSQL URL;
  neither build/start nor deployment runs it. Production bundles contain none of
  the fixture usage markers.
- PASS: all 37 Chromium tests, including admin/recruiter navigation, normal and
  RSC/prefetch access checks, legacy-route protection, sign-out, privacy cleanup
  confirmation/cancellation and mobile recruiter navigation. Screenshots of the
  recruiter privacy and admin usage pages visually reviewed. Privacy preloading
  still delivers full content without an extra click-time request.
- Optimized real-provider preview rebuilt on localhost:3000; sign-in HTTP 200.
  Production build, TypeScript and lint pass. No production admin was selected
  automatically, no live Neon writes or provider calls, migration, commit or push.

## Neutral Candidate Interview Flow (2026-10-20)

- Removed stored interview theme-color overrides from the candidate top strip
  and Start button. Candidate controls now use shared neutral tokens; existing
  teal/custom saved values no longer leak into candidate UI. Saved branding data
  is preserved and company logos still render. No migration or live data rewrite.
- Candidate audio orbs use a shared silver color, independent of persona colors.
  Microphone meters, elapsed progress, consent checkbox, completion indicator and
  feedback-selection rings are explicitly grayscale. Warning/error colors remain
  semantic. Speech, consent, transcript, interview and upload behavior unchanged.
- Added a shared dark candidate shell for setup/live/completion, closed/invalid
  links and standalone recording recovery. Recovery buttons now have explicit
  neutral surfaces, hover and keyboard-focus styling.
- Editor candidate preview matches the actual dark surface and white/gray CTA.
  Removed the obsolete brand-color picker rather than presenting a control that
  no longer changes candidate appearance. Existing hidden legacy values remain
  compatible with saves, templates and duplication; persona editor colors remain.
- Added isolated legacy-teal and closed-link E2E fixtures. Browser checks cover
  disabled/enabled Start colors, checkbox accent, silver SVG stops, desktop/mobile
  layout, microphone consent, live call controls, portaled transcript/end dialogs,
  cancellation, completion/feedback and recovery under light/dark app preferences.
- PASS: 159 unit/integration tests; four optional loopback PostgreSQL tests skipped.
  Desktop/mobile setup, live-call and completion screenshots visually reviewed.
  Optimized production build, TypeScript, lint and whitespace checks pass.
  Localhost preview rebuilt; recording recovery returns HTTP 200. Production
  bundles contain no candidate fixtures/test-provider markers. No live Neon
  writes, live provider checks, migration, commit or push.
- PASS: all 39 Chromium tests, including the legacy-teal full candidate flow,
  unavailable links/recovery, neutral editor preview, recording retry/idempotency,
  consent/intake and admin/recruiter isolation regressions.

## Monochrome Volo Logo and Favicon (2026-10-20)

- Replaced the remaining teal circle/off-white waveform in `app/icon.svg` with
  pure black and white. A thin white edge maintains visibility on dark tabs.
  Shared page-logo fills/strokes are explicitly black/white in both themes;
  inverted sidebar/mobile logos stay white with black strokes.
- Retained Next's root file-based icon metadata and generated cache-version URL,
  so public/auth/candidate pages inherit the same favicon without duplicate tags.
- PASS: two targeted Chromium tests verify inherited versioned icon metadata,
  SVG response, exact black/white source colors, zero colored rendered pixels
  and light/dark page logos. Production build/TypeScript, lint and whitespace
  checks pass. Optimized localhost preview rebuilt. Not committed or deployed;
  the hosted site requires deployment and cached tabs may need reopening.
