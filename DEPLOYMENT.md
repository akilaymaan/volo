# Production Deployment

## Architecture Decision

This is a monolithic Next.js App Router application. Pages use Server Components,
recruiter mutations use Server Actions, and auth/voice/report APIs use Route
Handlers in the same repository. There is no independent Render API service.

Deploy the full application on **one** of these alternatives:

| Host | Install/build | Start |
| --- | --- | --- |
| Vercel (Next.js preset) | `npm ci`, then `npm run build` | Managed by Vercel; no custom start command or static export |
| Render Node web service | `npm ci && npm run build` | `npm start -- --hostname 0.0.0.0 --port $PORT` |
| Docker/Node host | image build or `npm ci && npm run build` | `npm start` (honors `PORT`) |

`vercel.json` and `render.yaml` are alternatives, not a split deployment.
`vercel.json` pins functions to `cle1` (Cleveland, AWS us-east-2), the same
region as the Neon `volo-production` database. `cle1` is a currently supported
Vercel region; verify it remains supported on your plan before deploying.
Render uses Node 24.13.0, matching local verification; select Node 24.x on Vercel.
The Render sign-in health check is process liveness, not database readiness.
No Render pre-deploy hook, Vercel build command, or application instance runs
migrations automatically.

If using Vercel and Render together is mandatory, first extract a real backend
and move the relevant server-side page/action responsibilities into that API.
Changing a browser API URL or proxying only `/api/*` is not sufficient: SSR,
Server Actions, authentication and database queries still execute in Next.js.
No such extraction or cross-origin auth behavior is introduced here.

Provider account/plan options and live configuration must be confirmed before
deployment. No provider deployment or production database connection was made
as part of this preparation.

## Environment Variables

Set secrets in the host's environment/secret manager, never in source control,
client JavaScript, build logs, or a `NEXT_PUBLIC_*` variable.

### Application Runtime (Vercel Or Render)

| Variable | Required/configuration |
| --- | --- |
| `DATABASE_MODE` | `postgres` (unset also selects Postgres if a URL is provided) |
| `DATABASE_URL` | Neon **pooled** PostgreSQL URL, database `/neondb`, correct project/branch |
| `BETTER_AUTH_URL` | Canonical public HTTPS app origin, e.g. `https://interviews.example.com`; no `/api/auth` suffix |
| `BETTER_AUTH_SECRET` | Stable, strong random secret, at least 32 characters |
| `ANTHROPIC_API_KEY` | Required for real questions/interviews/analysis |
| `SARVAM_API_KEY` | Required for real STT/TTS |
| `RESEND_API_KEY`, `EMAIL_FROM` | Required if sending invitations; verify the sender |
| `RETENTION_CRON_SECRET` | Independent 32+ character secret if maintenance is configured |
| `RETENTION_ENABLED` | Default `0`; explicitly set `1` only after approving scheduled erasure |
| `ANTHROPIC_PRICING_JSON`, `SARVAM_TTS_USD_PER_MILLION_CHARACTERS` | Optional contracted pricing; unknown costs remain unpriced |

Optional AI model overrides are listed in `.env.example`. Never enable `AI_MOCK`
or `EMAIL_MOCK` in a real production environment. Do not set local `PGLITE_DIR`
as a substitute for PostgreSQL. Explicit PGlite mode is rejected on Vercel/Render.

Use a separate Neon branch/database and separate secrets for previews/staging.
Do not give untrusted preview deployments the production database URL.
`neondb` alone does not identify your project: verify the endpoint and branch
belong to `volo-production` in the Neon connection dialog.

### Migration Process

Supply the **direct** Neon connection as `DATABASE_URL` to a separate, approved
release process. The runtime keeps its pooled URL. There is no `DIRECT_URL` or
`DATABASE_URL_UNPOOLED` reader; adding those variables alone changes nothing.

The migration role needs permission to create the `drizzle` schema and to
create/alter application tables and indexes. The runtime role can have fewer
privileges now that application startup no longer migrates.

## TLS And The Installed Driver

Runtime and migrations share `src/lib/db/config.mjs`. This preserves Drizzle ORM
and Postgres.js 3.4.9, including `prepare: false` for transaction-pool compatibility.
Runtime connections are capped at five per app process, not five globally.

The installed Postgres.js implementation:

- Sets `rejectUnauthorized=false` for its string `sslmode=require`.
- Uses Node `tls.connect` for transport, and implements SCRAM-SHA-256 but not
  SCRAM-SHA-256-PLUS channel binding.
- Can forward unknown connection-string parameters as server startup parameters.

Consequently Volo always supplies `{ ssl: { rejectUnauthorized: true } }` for
remote PostgreSQL. URLs with no SSL mode or with `require`, `verify-ca`, or
`verify-full` get certificate-verified TLS; the mode is consumed before passing
the URL to Postgres.js. Prefer `sslmode=verify-full` in your stored URL.
There is no insecure certificate fallback.

`channel_binding` is rejected with an explanation rather than silently retained
or claiming security it cannot enforce. If the Neon dialog includes
`channel_binding=require`, obtain/use a driver-compatible URL without that
parameter only if certificate-verified TLS without channel binding meets your
requirements. If channel binding is mandatory, a driver change needs separate
review; do not weaken transport verification to make it connect.

Plaintext (`sslmode=disable`) is permitted only when explicitly selected for a
loopback host in local development/tests. We did not test TLS against live Neon.
Use the original Neon DNS hostname so TLS SNI/certificate hostname checks work.
Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Migration Workflow

All six original migrations, their ordering, journal, snapshots and application
schema are preserved. No `push`, reset, rewritten history, or data deletion is
part of this deployment preparation.

1. Confirm the intended project/branch and `/neondb`. Take a backup/branch before
   upgrading an existing database. A fresh Neon database starts with no local data:
   migration is not an export of PGlite accounts/interviews/recordings.
2. In the approved migration process, securely inject the direct `DATABASE_URL`.
   Do not paste credentials into shell history or screenshots.
3. Run:

   ```bash
   npm ci
   npm run db
   ```

4. Require a successful exit before releasing the matching app build.
   The runner records applied SQL in `drizzle.__drizzle_migrations` and seeds
   the four built-in interviewers. Re-running skips applied migrations.
5. Give the app its pooled `DATABASE_URL`, canonical origin and other secrets.
   Build/start the chosen host without migrations.
6. With approval, smoke-test signup, interview creation, candidate consent/voice,
   recording, report, comparison and tenant isolation in staging before launch.

The direct connection holds a Postgres advisory lock on one non-recycled
connection while Drizzle applies pending migrations transactionally. A competing
Volo migration process fails clearly and must be retried later. Neon `-pooler`
endpoints are rejected for migration jobs because session locks require a direct
connection. Other proxy hosts cannot be reliably detected; do not use them.
Tools that bypass this runner do not participate in its lock.
Driver errors are sanitized so connection strings/passwords are not logged.

`npm run db` fails when `DATABASE_URL` is absent, even if local mode is configured.
`npm run db:migrate` remains an alias. The local command is separate.

For **future** intentional schema changes only:

```bash
npm run db:generate -- --name=describe_change
# Review the newly generated SQL, then apply it through the approved process.
npm run db
```

Do not regenerate existing migrations. Note the historical retention CHECK
constraint lives in migration SQL, not the current TypeScript snapshots; deploy
the full migration history rather than rebuilding from schema introspection.

## Local Development

Copy `.env.example` to a private local env file, then explicitly configure:

```dotenv
DATABASE_MODE=pglite
DATABASE_URL=
PGLITE_DIR=.data/pglite
BETTER_AUTH_URL=http://localhost:3000
```

With the local server stopped, run `npm run db:local`, then `npm run dev`.
Build/start/dev commands do not initialize or migrate any database.
Existing local env files need the new explicit mode setting.
The local migration command refuses a nonempty `DATABASE_URL`, preventing an
accidental remote operation. Never open a PGlite directory in two processes.

## API URLs, Auth And Cookies

Browser calls remain same-origin relative `/api/*` requests. The auth client
uses the current origin; the auth handler stays at `/api/auth/*`.
Server Components and Server Actions use the same app's database configuration.
No `NEXT_PUBLIC_API_URL`, cross-origin rewrite, wildcard CORS header, shared
cross-domain cookie, or `SameSite=None` workaround is needed or added.

Set `BETTER_AUTH_URL` to the public app origin, not an internal Render hostname,
Vercel-to-Render URL, or database endpoint. Better Auth uses its existing
base-URL/session integration. This app uses email/password auth; no OAuth
provider callbacks are currently configured.

Candidate cookies stay host-only, HttpOnly, SameSite=Lax and scoped to `/api/call`.
They are Secure when either the public canonical origin or the actual request
is HTTPS, including a Render proxy that forwards internal HTTP to Next.js.
Use one canonical host (redirect alternate www/non-www names at the hosting
layer), and configure staging origins explicitly instead of trusting all previews.
Keep Next.js/Better Auth origin protection enabled. Do not expose a second copy
of the production app on another origin as an API shortcut.

## Remaining Deployment Risks

- Confirm hosting request size, request timeout, function duration, region and
  Node-version availability against the selected plan. The existing README notes
  Vercel's 4.5 MB request limit; Volo accepts larger PDFs/recordings at the app
  layer, so long uploads may require full-app Render hosting or future direct
  object-storage uploads. Routing only API calls to Render is not a ready-made fix.
- `after()` analysis is best-effort, not a durable job queue on either host.
  Process restarts, sleep or timeouts can lose work; explicit retries exist.
  Use always-on capacity for a latency-sensitive production voice interviewer.
- Database recordings increase Neon storage/transfer usage. Data retention and
  backups require an operational policy; deployments do not enable deletion.
- Multiple app instances need attention to Next.js cache coordination, stable
  Server Action encryption keys (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` when
  self-hosting multiple builds/instances), and version-skew handling.
- Secrets, DNS, TLS, email sender verification, schedules, monitoring, provider
  rate limits and billing controls still require setup and approved live checks.

## Verification And Changed Files

Local verification on Windows / Node 24.13.0:

- PASS: 49 tests across 12 files, including three real PostgreSQL integration
  tests against an isolated, loopback-only PostgreSQL 15 Docker container.
- PASS: all six migrations apply to an empty database, seed four interviewers,
  and preserve inserted fixture data on a second run. A second migration process
  is rejected while the advisory lock is held. JSONB, BYTEA and transactions work.
- PASS: the CLI exits nonzero with a clear missing-`DATABASE_URL` error and does
  not create a PGlite directory. Explicit local migrations remain idempotent.
- PASS: existing SQL content fingerprints, TLS configuration in the installed
  driver, credential-safe configuration errors, and proxy Secure-cookie tests.
- PASS: lint, typecheck, and production build. The build used an empty
  `DATABASE_URL` with Postgres mode and did not initialize a database.
- PASS: all 11 production-build browser E2E tests through `npm start`, preserving
  recruiter signup, candidate voice/recording, reporting and access controls.
  An existing transient-button locator race was fixed in the test, not the app.

To include real PostgreSQL tests in `npm test`, supply `TEST_POSTGRES_URL` for
an explicitly disposable loopback database named `volo_deploy_test`. The tests
reject remote hosts and other database names; without this variable those
three tests skip. CI provides a disposable PostgreSQL service automatically.
Never supply a production URL for tests.

The local Docker image was cached; no image download or production connection
was needed. The disposable database is not kept after verification. Chromium
was selected using an installed executable via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`,
with `NEXT_BUILD_DIR=.next-verify` and `E2E_PORT=3217`.
Neon TLS/connectivity, cloud provider validation/deployment, Linux CI execution,
live email/AI and the application Docker image build were not run.

Files changed for deployment preparation (earlier Phase 1 work is preserved):

- Commands/migration runner: `package.json`, `scripts/migrate.mjs`,
  `scripts/database-migrations.mjs`.
- Database selection/TLS: `src/lib/db/index.ts`, `src/lib/db/config.mjs`.
- Proxy cookie handling: `src/lib/security.ts`, `src/app/api/call/start/route.ts`.
- Hosts/image: `vercel.json`, `render.yaml`, `Dockerfile`, `.dockerignore`.
- Tests/CI: `.github/workflows/ci.yml`, `playwright.config.ts`, `e2e/flow.spec.ts`,
  `src/lib/__tests__/database-config.test.ts`, `deployment.test.ts`,
  `postgres-deployment.test.ts`, `migration-cli.ts`, `security.test.ts`.
- Environment/documentation: `.env.example`, `README.md`, `DEPLOYMENT.md`,
  `PRODUCTION_READINESS.md`.

No schema, original SQL, migration journal or snapshots were changed in this
increment. No dependencies, secrets, commits, production migrations or deployed
services were added.
