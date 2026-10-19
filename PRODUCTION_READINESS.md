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
