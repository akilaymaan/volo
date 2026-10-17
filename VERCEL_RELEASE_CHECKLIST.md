# Vercel + Neon Release Checklist

## Audit Status

This is a full-stack Next.js application. Vercel hosts pages, Server Components,
Server Actions, auth and API routes together. No Render backend or separate
browser API URL is required.

Local branch: `main`. Local HEAD and cached `origin/main`: `694f407`.
The earlier commit is `b2e6778`. Fresh remote state has not been fetched.
The preparation/Phase 1 changes remain uncommitted, including new migrations
`0003` through `0005`, snapshots, shared database configuration and Vercel config.
The committed HEAD still runs migrations automatically in build/start scripts;
the working copy fixes that. Do not deploy the old commit as if it included
these safeguards, and do not push/merge to a connected production branch casually.

The locally configured runtime URL has a pooled Neon hostname, Ohio region
shape and `/neondb`, but contains `channel_binding` and is rejected by the
installed database configuration. No connection was attempted. These URL
properties cannot prove the project/branch names; verify those in Neon.
The local auth origin is localhost HTTP, suitable for local development only.
Local credentials do not prove that Vercel environment variables are configured.

There is no local `.vercel/project.json`, Vercel CLI, or available Vercel/Neon
MCP integration. No local Vercel/Neon API token was detected. GitHub CLI exists,
but its authenticated access and current remote deployment state are unverified.
The absence of a local link does not prove there is no project in your account.

No production migration, push, deployment, promotion, paid AI call or real email
has been authorized/performed in this audit. No live deployment URL is verified.

## Release Blockers And Risks

1. Review, secret-scan, commit and push the tested working copy on a non-production
   branch with approval. Include the entire migration journal/SQL/snapshot set.
   Open a pull request so the existing PR-triggered CI runs. Do not merge yet.
2. Resolve the unsupported URL parameter deliberately. Postgres.js 3.4.9 cannot
   enforce channel binding. Use a driver-compatible URL without that parameter
   only if certificate-verified TLS without channel binding is acceptable.
   Otherwise a driver change needs separate review. Never disable certificate
   verification. `sslmode=verify-full` is the preferred stored setting.
3. Verify Neon project `volo-production`, branch `production`, database `neondb`
   and AWS US East 2 (Ohio) in the dashboard before any production operation.
   Live migration status is unknown, not assumed empty or already migrated.
4. Current `vercel.json` has no function region pin. Verify the currently supported
   region nearest AWS Ohio from official Vercel documentation before choosing it.
   No guessed region code or unverified region setting has been added.
5. The app accepts 8 MB PDFs, 25 MiB recordings and 10 MB Server Action bodies.
   The existing README notes a lower Vercel request-body cap. Confirm current
   limits/plan; Next.js body limits do not override platform limits. The recording
   upload currently ignores failed fetch responses, so recording loss can be
   invisible to the candidate. Resolve the size/error UX before promising large
   uploads; direct object-storage upload requires a separately approved change.
6. `after()` analysis is best-effort and shares function execution limits.
   Voice/recording routes specify 60 seconds and analysis paths up to 300 seconds;
   verify actual Vercel plan/runtime limits and test timeout/retry behavior.
   There is no durable queue. Database-backed recordings need storage budgeting.
7. Auth uses persistent DB sessions and same-origin host-only cookies. HTTPS,
   stable signing secrets, correct canonical origins and applied auth tables are
   essential. Email verification/password recovery are not implemented.
8. Live AI model access, speech, email, logs and hosting settings are unverified.
   Missing local Resend credentials disable email invitation delivery; absence
   locally says nothing about settings in the Vercel account.

## Exact Environment Checklist

Everything in this table is server-side. Never prefix credentials with
`NEXT_PUBLIC_`, print them, add them to a commit, or paste them into a report.

| Variable | Production | Preview | Local Development |
| --- | --- | --- | --- |
| `DATABASE_MODE` | `postgres` | `postgres` | `pglite` explicitly, or `postgres` for a development DB |
| `DATABASE_URL` | Pooled URL for confirmed production branch | Pooled URL for isolated preview/staging branch; never production by default | Empty for PGlite, otherwise a development DB URL |
| `BETTER_AUTH_URL` | Exact canonical HTTPS app origin, no `/api/auth` suffix | Exact HTTPS preview origin; a stable staging hostname simplifies this | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Strong stable random secret, 32+ characters | Separate stable non-production secret | Separate development secret |
| `ANTHROPIC_API_KEY` | Real Claude access | Restricted non-production access for approved live tests | Development key or explicit mock mode |
| `SARVAM_API_KEY` | Real STT and TTS access; one shared provider credential | Restricted non-production access for approved live tests | Development key or explicit mock mode |
| `RESEND_API_KEY` | Required for email invitations | Test/restricted mail access if testing invitations | Optional |
| `EMAIL_FROM` | Verified Resend sender for invitations | Verified allowed test sender | Optional |
| `RETENTION_CRON_SECRET` | Independent 32+ character secret if maintenance is configured | Separate secret, if used | Optional |
| `RETENTION_ENABLED` | Keep `0` until deletion policy/schedule is explicitly approved | Normally `0` | Normally `0` |
| `CLAUDE_MODEL` | Optional override; default `claude-opus-5-5` | Confirm account/model access before real tests | Optional |
| `CLAUDE_INTERVIEWER_MODEL` | Optional override; default `claude-haiku-5-5` | Confirm access and latency | Optional |
| `SARVAM_STT_MODEL` | Optional override; default `saaras:v4` | Match intended tested model | Optional |
| `SARVAM_TTS_MODEL` | Optional override; default `bulbul:v3` | Match intended tested model | Optional |
| `ANTHROPIC_PRICING_JSON` | Optional contracted token pricing | Optional test pricing | Optional |
| `SARVAM_TTS_USD_PER_MILLION_CHARACTERS` | Optional contracted pricing | Optional | Optional |
| `AI_MOCK`, `EMAIL_MOCK` | Unset/`0` for real service | Normally unset/`0` for real-provider validation; explicitly label mocked previews | May be `1` for a demo |
| `PGLITE_DIR` | Do not use | Do not use | Optional path, default `.data/pglite` |
| `NEXT_BUILD_DIR` | Leave unset | Leave unset | Optional isolated build directory |

Vercel manages `NODE_ENV` and its platform variables; a Preview deployment is
still a production-mode Next.js build. Do not set `NODE_ENV=development` there.
There is no extra transcription API key, browser API URL, `DIRECT_URL`,
`DATABASE_URL_UNPOOLED` or Neon API key consumed by the app. Operational access
tokens for deployment/account inspection must not become application secrets.

## Neon Preflight And Approval Gate

The six local migrations are ordered by `drizzle/meta/_journal.json`:

| Migration | Effect |
| --- | --- |
| `0000_init` | Initial auth/interview/response/recording schema |
| `0001_seed_interviewers` | Inserts four built-in interviewer presets |
| `0002_review_hardening` | Analysis/request fields and unique feedback constraint |
| `0003_production_foundation` | Consent/session/retention fields, attempt claims, rate limits; backfills claims |
| `0004_email_invitations` | Invitation records and response links |
| `0005_usage_and_retention_indexes` | Usage ledger and retention indexes |

No migration drops/truncates tables or deletes existing rows. New constraints
can still fail on incompatible existing data or lock tables during execution.
The seed and backfill are data writes, not read-only checks.

Before any write, select the confirmed project/branch/database in Neon's SQL
editor and inspect status read-only:

```sql
SELECT current_database(), current_user;
SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_journal;
```

Only if the journal exists:

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at;
```

Compare with local journal timestamps and inspect any unexpected existing
tables/history. A missing journal does not prove the database is empty.
Stop for reconciliation rather than resetting, pushing or fabricating history.
Report pending migration names and risks, confirm backup/rollback arrangements,
and obtain approval covering schema changes, preset seed and claim backfill.

Only after approval, supply the direct Neon URL as `DATABASE_URL` to a separate
controlled process and run `npm run db`. Never use the runtime pooled URL for
this runner. It holds a direct-connection advisory lock and skips applied
migrations. Build/start/dev do not migrate. Do not run generation, push or reset
as a substitute for applying the reviewed existing history.

## Safe Deployment Order

1. Complete public-documentation and account-access checks with permission.
2. Resolve URL compatibility, review the dirty tree and scan staged content for
   secrets. Keep private env files ignored. Commit approved changes to a preview
   branch, not the connected production branch.
3. Verify that branch/commit on GitHub and run PR CI. Never infer a push from
   local commits or cached refs.
4. Locate or connect the Vercel project to `akilaymaan/volo`. Use Next.js preset,
   repository root, Node 24.x, `npm ci`, and `npm run build`; no migration hook,
   static export, separate backend or custom Vercel start command.
5. Configure Preview variables with an isolated Neon branch, correct preview
   origin and non-production secrets. If project import would automatically
   create a Production deployment, stop rather than accepting that default.
   Verify a preview-only linking/creation workflow with current docs/account tools.
6. Inspect and approve preview database initialization separately. Deploy the
   preview branch, record the exact deployment URL/commit/status, then smoke-test.
7. Verify production project/branch/history and obtain explicit migration approval.
   Apply only the reviewed pending migrations through the controlled direct job.
8. Configure Production variables, verify region/plan/monitoring and obtain
   production release approval before merging/promoting. A push to a connected
   production branch can deploy automatically, so treat it as a production action.
9. Verify the actual Production URL/status and repeat smoke tests.

## Live Smoke-Test Checklist

- Load the app; navigate dashboard, interviews, interviewers and usage/privacy.
- Sign up, sign in/out; refresh and reopen the browser to verify session behavior.
- Create/edit/save an interview; generate questions with the real approved model.
- Open a candidate link in another session; consent and microphone permissions.
- Complete a voice interview; verify speech, captions, follow-ups and hard stops.
- Confirm persisted response/transcript, analysis status, evidence and report.
- Upload/play back a recording; verify access denial from another account.
- Exercise a near-limit upload and rejected upload; ensure errors are visible.
- Test denied microphone permission, network loss, expired/revoked invitation,
  duplicate completion and provider failures without unsafe hiring automation.
- Inspect Vercel failed requests, function duration/timeouts, Neon connections,
  database errors and provider errors; never log credentials/candidate content.
- Mark real-provider checks separately from mocked automated tests. Do not claim
  a live smoke test or deployment URL until actually observed and verified.
