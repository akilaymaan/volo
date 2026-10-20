# Volo: AI voice interviews in 11 Indian languages

Volo runs first-round hiring interviews for you. Paste a job description and Claude drafts the questions. Share one link, and each candidate has a live voice conversation with an AI interviewer that asks real follow-ups. You get back a scored report with the recording, the transcript, and a question-by-question summary.

**What you get:**

- **An interview editor.** Write the objective, generate questions from a job description (paste it or attach a PDF), then edit, reorder and set follow-ups. Pick an interviewer persona, a language and a length. Add your logo and an optional invite list. A neutral live preview shows what candidates will see.
- **A candidate page that just works.** A mic check, a consent step, and an audio-reactive interviewer. Live captions and a transcript drawer. Answers end when the candidate pauses (or presses Space). Tab-switch tracking, a server-side time limit, and one attempt per email.
- **Consistent candidate styling.** Setup, live calls, completion, unavailable links and recording recovery share a neutral dark surface, white/gray controls and a silver audio-reactive orb. Old saved brand/persona colors do not override the candidate interface. Company logos remain supported; warnings and errors retain their semantic colors.
- **Reports.** Overall score and hiring recommendation, a communication score, strengths and gaps, verbatim quotes, a summary for each question, the full recording and transcript, and a candidate status (shortlisted, maybe or rejected).
- **Neutral report styling.** Answered/shortlist badges, positive scores and hire recommendations use black/white/gray styling. Transcript and interview-summary avatars ignore saved persona colors without changing the persona itself. Warnings and errors retain their semantic colors; audio/evidence links and assessment values are unchanged.
- **Interview overview.** Completion rate, average score and length, candidate satisfaction, AI insights across all candidates, search and filtering, and CSV export.
- **A creation-first workspace.** New workspaces land on a simple welcome screen with New interview as the main action and an optional template link. Returning users see a clean interview list with search, live/paused status and response counts—not graphs or average scores. A flat sidebar removes duplicate Home/Interviews and nested Activity links. Quick actions (Ctrl/Cmd+K), collapsed/mobile navigation and the neutral light/dark theme remain available.
- **Guided interview creation.** New interviews open a three-step role → questions/format → launch flow, with manual or AI-generated questions and a candidate preview. Switch to Full editor at any time without losing settings; existing interviews and template/duplicate starts retain the full editor. New-interview drafts automatically save on this browser, scoped to the signed-in workspace and source, and recover for up to seven days. They are not synced across devices; file attachments must be reattached. Storage failures and stale-tab conflicts are surfaced, and successful creation or confirmed discard removes the corresponding draft. Avoid sensitive draft information on shared devices.
- **Separate analytics.** Open Analytics (`/dashboard/analytics`) for monthly interview activity, review distribution and summary metrics. Date, interview-name and live/paused filters are shareable URL parameters; chart data tables and CSV export remain available. Analytics are account-scoped, read-only and not automatically prefetched on entry. The interviews home page does not run these analytics queries.
- **Recruiter review inbox.** A cross-interview attention queue for unopened reports, candidates needing a decision, failed/stalled analysis and responses without recordings. Filter by interview, review status and UTC start date. Opening the inbox never marks reports viewed or starts AI; confirmed analysis retries are owner-scoped and rate-limited.
- **Bulk candidate review.** Select up to 100 candidates in an interview and confirm a shared review status: Shortlisted, Maybe, Rejected or Not reviewed. Search/status filter changes clear selection, and the confirmation lists the affected candidates. Ownership, completed responses and expected statuses are checked atomically; missing or changed candidates reject the whole batch. No emails are sent and AI scores are unchanged.
- **Interviewer personas.** Four built in (Lisa, Bob, Aarav, Meera), or create your own with a Sarvam voice and sliders for empathy, depth, rapport and pace.
- **Personal templates and duplication.** From an interview's **More actions** menu, save its current settings as a named template or open a duplicate in the editor. Use **Templates** in the sidebar to start a new interview or delete a template. Each copy is independent: candidate emails, invitations, responses, recordings and insights are excluded. Restricted intake stays restricted and needs new invitations. A template survives deletion of its source interview; deleting it keeps existing interviews. If its custom interviewer has been deleted, choose a replacement before saving.
- **Audio-linked evidence.** New recorded interviews capture turn-level audio positions. Click a transcript timestamp or a question's evidence link to play the relevant segment; the current transcript turn is highlighted during playback. Older recordings remain playable with plain transcript links when timing was not captured.
- **Recording upload recovery.** Completed recordings are temporarily saved in this browser before uploading. Candidates see progress, bounded retries and explicit server confirmation, and can retry after reconnecting or refreshing through **Recording recovery**. Local copies are removed after confirmation or explicit discard and expire within the existing three-hour session window.
- Dark mode, mobile layouts, keyboard support, and reduced-motion support.
- **Sidebar account menu.** Your name and email replace the bottom-left workspace selector. Open the menu for dark mode, privacy/data retention and sign-out; an initials avatar keeps it accessible in the collapsed sidebar, and the mobile navigation drawer includes the same controls. The header contains Quick actions only.
- **Responsive interactions.** Volo branding stays at the dashboard's top-left, with an icon-only collapsed state and mobile header. Short press/sidebar transitions respect reduced motion. Navigation shows immediate pending feedback, visible safe pages fully preload in production, and dashboard/inbox filters navigate without full-page reloads. Reports and analysis-triggering pages are never prefetched; server/provider operations still require real confirmation and can take time.

## Quick start (about 2 minutes)

### One-click preview access

The default entry screen is **Enter Volo**: no email, password or signup form.
Clicking creates a real, isolated guest user/session with a signed authentication
cookie. It does not expose any existing recruiter's workspace or grant admin
access, and it does not enable demo data or mock providers. Internal guest email
identifiers are non-deliverable and hidden from the account menu; no mail is sent.

Guest workspaces depend on their session cookie. Signing out, clearing cookies or
session expiry loses access; this does **not** delete their server-side records.
Do not use guest access for sensitive candidate data. A sign-out confirmation
warns about this. Use **Use an existing account** for an existing saved workspace.

- `GUEST_ENTRY_ENABLED=1` (default): enables one-click entry. Set `0` to disable
  guest creation and return to existing-account sign-in.
- `ENABLE_EMAIL_SIGNUP=0` (default): pauses both the signup page and email signup
  API. Set `1` and restart/redeploy to re-enable registration later. Existing
  password accounts can always sign in. Guest data is not automatically moved
  into a newly registered account; account upgrade/transfer is a future feature.
- Guest creation is limited to 10 per resolved IP/hour and 200 globally/day,
  backed by the shared database. These are creation limits, **not AI spending
  caps**. Guest actions use your real configured provider credits. Keep the
  preview private or use hosting-level access protection; disable guest entry
  before a public production launch unless that exposure is intentional.

No schema migration is needed. Guest access uses the existing authentication
tables; database migrations still never run implicitly during build/start.

### Local setup

Requires Node.js 20.9 or newer.

```bash
git clone https://github.com/fahmmin/volo.git && cd volo
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `ANTHROPIC_API_KEY`: from <https://console.anthropic.com>
- `SARVAM_API_KEY`: from <https://dashboard.sarvam.ai>
- `BETTER_AUTH_SECRET`: any long random string (`openssl rand -base64 32`)

```bash
npm run db:local
npm run dev
```

Open <http://localhost:3000> and create an account. The example configuration explicitly selects local PGlite in `./.data`. Run `npm run db:local` again when new migrations are added, with the local server stopped. Existing local env files need `DATABASE_MODE=pglite` and an empty `DATABASE_URL`.

The app requires real provider credentials. Missing keys produce a setup error;
there is no demo mode or fake AI/email fallback.

## Recruiter review inbox

Open **Review inbox** in the sidebar or Interviews header, or visit
`/dashboard/inbox`. It includes completed responses from all your interviews,
including paused interviews. A response appears if it is unopened, has the
**Not reviewed** status, has failed/stalled analysis, or has no uploaded recording.
These categories overlap; the total counts unique attention items, not badge sums.
Resolved candidates remain available in their original interview pages.

Opening a report clears only its unopened flag; you must set a candidate review
status yourself to clear **Needs decision**. Merely reading/filtering the inbox
does not change response data, finalize live calls, queue AI work or send emails.
Report/interview links disable prefetch so viewing the list cannot invoke those
pages' existing view/finalization behavior.

Filters apply server-side to owned completed responses. Dates use interview start
times in UTC, with an inclusive Through date. Counts respect interview, status and
date filters; selecting an attention type changes the list without narrowing the
other facet counts. Results use stable newest-first ordering and 25-row pages.
Links preserve filters; applying/resetting filters returns to page one. Deep browsing
is bounded at page 1000; narrow interview/date filters to reach older results.

**Retry analysis** appears only for failed or stalled analysis, including queued
or running work with no timestamp or a timestamp at least five minutes old. Confirm
the provider-cost warning before queueing a retry. Fresh queued/running work and
completed analyses cannot be retried from the inbox. The existing per-account
30-attempt/10-minute analysis limit applies, and an atomic state check rejects
stale/concurrent attempts. Queue acknowledgement does not mean analysis succeeded;
the inbox refreshes while matching completed responses have analysis in progress.
There is also a manual Refresh inbox button. Historical responses without snapshots
use current interview settings, as with the existing report re-analysis action.

**Without recording** does not prove upload failure: candidates may still upload
within their three-hour session window. Only their original browser can recover
a locally saved copy; the recruiter inbox cannot recover it on their behalf.
This feature needs no email setup, new dependency or database migration.

## Invitations, reports and privacy

- Add `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender) to enable email.
  Create an interview, then use its **Invitations** tab to send personal links.
  Links expire after seven days. Resends rotate the token and require a one-minute
  wait; account sends are capped at 100 attempts/hour. "Sent" means the provider
  accepted the message, not that it was delivered or opened.
- The **Invitations** tab also supports **Bulk invitations and reminders**. Upload
  a CSV under 100 KB with up to 100 recipients, an `email` header and optional
  `name` header. Quoted CSV fields and UTF-8 BOMs are supported. Names are shown
  for review, not saved as candidate identities. Preview flags invalid/duplicate
  emails, existing invitations, started candidates and allowlist restrictions.
  Confirm the eligible recipients to send; results appear per recipient. Keep the
  tab open. **Stop after current send** leaves remaining recipients unsent.
  A network failure stops the batch without automatic retries; refresh the
  preview and check invitation status before retrying an unconfirmed send.
- Choose **Reminders** to manually remind recipients from a CSV. Only previously
  accepted, unexpired, non-revoked invitations for candidates who have not
  started qualify. Wait 24 hours after the last attempt; reminders stop at three
  total send attempts (including the initial invitation and failures). A reminder
  rotates the personal link, replacing the old one. Automatic scheduled
  reminders are not enabled. The existing per-account sending limit still applies.
- Enable **Require personal email invitations** to restrict an interview.
  An email allowlist also requires personal links; saving a list does not send mail.
  Public interviews still work, but typed names/emails do not verify identity.
- Candidates must acknowledge a versioned AI/recording disclosure. Consent time,
  interview configuration and interviewer personality are saved with the response.
  Calls use separate short-lived HttpOnly credentials, not report IDs.
- New reports have a consistent 0–4 question rubric and exact transcript citations.
  Unsupported questions are not scored. Scores and recommendations are advisory:
  a recruiter must review evidence and manually change candidate status.
- Select 2–4 candidates from one interview to compare reports. Question sets,
  objective, language, duration and rubric version must match. Historical responses
  without an interview snapshot cannot be compared.
- Set retention days in the interview editor (90 by default, new responses only).
  **Privacy and data retention** previews expired records and offers confirmed deletion.
  Deleting a response removes its recording, linked survey feedback, invitation,
  attempt claim and cached cohort insights. Usage counts survive without a response
  identifier. Legacy responses are not assigned invented consent or deletion dates.

For scheduled retention, deployment requirements, limitations and verification,
see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Admin API usage and recruiter privacy

Recruiters use **Privacy and data retention** (`/dashboard/privacy`) to preview
and explicitly delete only their own expired candidate data. No provider usage,
token counts or cost estimates are included on that page.

Platform-wide usage is at `/dashboard/admin/usage`. It requires an authenticated
account whose exact ID is listed in the server-only `ADMIN_USER_IDS` environment
variable. No accounts are admins by default. To enable your account:

1. Sign in and copy **Your account ID** from Privacy and data retention.
2. Set `ADMIN_USER_IDS=your-account-id` in the server environment (comma-separated
   for multiple admins). Do not use an email address or a `NEXT_PUBLIC_` variable.
3. Restart the local server, or redeploy after configuring the production host.

Admin-only API usage then appears in navigation and Quick actions. Non-admins
receive a 404 on both the admin URL and the old `/dashboard/usage` URL; unauthenticated
visitors must sign in. Old usage bookmarks redirect only after admin authorization.
Usage recording continues internally; this is an access-control change, not a
change to provider billing or candidate-retention permissions. Removing an ID and
restarting/redeploying revokes access; account deletion/recreation does not inherit it.

## Troubleshooting invitation email

Email invitations use Resend, not the AI provider. In Vercel **Project Settings →
Environment Variables**, configure `RESEND_API_KEY` and `EMAIL_FROM` for
**Production**, then redeploy so the new deployment receives the values. For other
hosts, set the same server-side environment variables and restart/redeploy.

`EMAIL_FROM` must be an email address on a domain you have verified in the same
Resend account as the API key. A display name is optional. Do not use a personal
Gmail address as the sender. Resend's test sender is restricted to its account's
own email address; it cannot deliver production invitations to arbitrary candidates.
See [Resend's sending restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

The Invitations tab warns about missing/invalid local email configuration and
disables sending until corrected. Known setup problems do not create an invitation,
rotate an existing link or consume a send attempt. Provider rejections distinguish
key/permission, domain verification, test-sender, quota and rate-limit problems
without exposing private provider responses. Provider acceptance is still not a
delivery guarantee. For network failures, check the invitation list and Resend
email status before retrying; resends wait at least one minute and replace the link.

## Reviewing recordings

Open a candidate report to use the recording alongside its transcript. Timestamp
buttons become available when the audio has loaded. Evidence links under
**Question by question** seek to the cited turn and scroll to its transcript.
If audio cannot load, the text and ordinary transcript links remain available.

Positions are captured from the browser's recording audio clock, rather than
the server's transcription time. They mark approximate turn/answer-segment
starts, including thinking pauses, not the exact word containing a quote.
Browser buffering can affect alignment. These candidate-supplied positions are
navigation aids and are not used for scoring or integrity checks.

Timing metadata is validated and saved atomically with the first recording
upload. Subsequent uploads cannot replace the bytes or retime the transcript.
Missing timings are not reconstructed for historical reports. This feature
uses the existing transcript JSON storage and requires no database migration.

## Recovering recording uploads

Keep the completion screen open until it says the recording was saved. Upload
progress reaches 100% only after the server acknowledges the upload. Temporary
network, rate-limit and server failures get at most two automatic retries per
attempt. A retry checks server acknowledgement first, so a saved-but-lost reply
does not resend recording bytes or change existing transcript timing cues.

If interrupted after the completed recording was saved locally, reopen the same
site in the same browser and choose **Recording recovery** from the candidate-page
footer, or open `/recording-recovery` directly. A pending-copy notice also appears
on that interview's intake page. Restored copies require an explicit retry; an
enabled attempt resumes when the browser reconnects. This also works after the
interview stops accepting new candidates, while the original session remains valid.

Recovery uses IndexedDB for up to three unexpired recordings of at most 25 MB
each. Older unexpired copies are never silently evicted. If storage is unavailable,
blocked or full, the completion screen retains a memory-only copy and warns not to
refresh or close the tab. Candidates can download a copy or explicitly remove the
local copy. Downloaded files are not automatically deleted by recovery cleanup.

Only audio, navigation timing, response/interview IDs and bounded upload metadata
are persisted—no session token, candidate name/email or transcript text. Uploads
still require the original HttpOnly session cookie, and revoked/deleted sessions
are rejected. The upload deadline remains three hours from starting the interview;
expired/invalid local records are purged on recovery access, or at expiry while
their recovery card is open. Successful uploads remove their local copy. If cleanup
fails, the UI warns and offers manual removal/site-data cleanup.

This is completed-recording upload recovery, not live-call resume or mid-call
crash recovery. Closing the tab before local preparation completes can lose the
recording. Browser eviction, cleared cookies/storage, a different browser/site,
private browsing and expired permission can prevent recovery. No background worker
uploads while the page is closed. Host upload limits still apply (including
Vercel's 4.5 MB request limit); a permanent size rejection offers download rather
than an endless retry. New candidates acknowledge the updated local-storage
disclosure; historical consent records are unchanged. No migration is needed.

## Deploying

Volo is one full-stack Next.js application, not a static frontend plus a separate backend.
Choose Vercel **or** Render to host the entire application; both deployment configurations
are provided as alternatives. A Vercel frontend/Render API split requires a separate
architectural change because Server Components, Server Actions, auth and API routes
currently share the same origin and server-side database access.

1. Set `DATABASE_MODE=postgres` and the **pooled** Neon URL as runtime `DATABASE_URL`.
2. Configure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the canonical HTTPS app origin),
   `ANTHROPIC_API_KEY` and `SARVAM_API_KEY` on the chosen host.
3. In an approved separate migration process, supply Neon's **direct** URL as
   `DATABASE_URL` and run `npm run db`. No separate direct-URL variable is read.
4. Build with `npm ci && npm run build`. Vercel runs the resulting Next.js deployment;
   Render starts with `npm start -- --hostname 0.0.0.0 --port $PORT`.

Build, start and development commands never run migrations. Missing PostgreSQL
configuration fails clearly; hosted deployments cannot fall back to PGlite.
Postgres.js uses certificate-verifying TLS; `channel_binding` URL parameters are
rejected because this installed driver does not implement them.

See [DEPLOYMENT.md](DEPLOYMENT.md) for TLS details, commands, environment variables,
same-origin auth/cookies, release ordering, verification and hosting limitations.

### Docker

```bash
docker build -t volo .
docker run -p 3000:3000 --env-file .env.production.local volo
```

The runtime env file must select PostgreSQL and contain the pooled connection.
Keep it private. The image neither contains secrets nor runs migrations.

### Any Node server

```bash
npm ci && npm run build && npm start   # no migrations in build/start
```

## How a live interview works

```
browser mic ──► voice activity detection (splits answers into clips under 30s)
            ──► POST /api/call/turn
                 ├─ Sarvam saaras:v4  speech → text
                 ├─ Claude            decides the next thing to say (follow up / next question / wrap up)
                 └─ Sarvam bulbul:v3  text → speech
            ◄── interviewer audio + captions
```

- The transcript is stored on the server as the conversation happens. When the call ends, Claude scores it in the background (`next/server` `after()`).
- The whole call (both voices) is recorded in the browser and uploaded at the end.
- If a candidate closes the tab mid-interview, the call is closed on the next dashboard visit and still gets analyzed.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Claude |
| `SARVAM_API_KEY` | required | Speech-to-text and text-to-speech |
| `BETTER_AUTH_SECRET` | required in production | Signs sessions |
| `BETTER_AUTH_URL` | inferred | Public URL of the app |
| `DATABASE_MODE` | postgres | Use `pglite` explicitly for local development/tests only |
| `DATABASE_URL` | required for Postgres | Runtime pooled URL; direct URL in the separate migration process |
| `PGLITE_DIR` | `.data/pglite` | Storage directory in explicit local mode |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Question generation, scoring, insights |
| `CLAUDE_INTERVIEWER_MODEL` | `claude-haiku-5-5` | The live interviewer. A fast model keeps the wait between turns short |
| `SARVAM_STT_MODEL` | `saaras:v4` | Speech-to-text model |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | Text-to-speech model |

## Development

```bash
npm run db:local     # explicitly initialize/migrate local PGlite (server stopped)
npm run dev          # app; no migration side effects
npm run preview      # optimized local build + server on port 3000; real providers, no migrations
npm test             # unit tests (Vitest)
npm run build        # production build
npm run test:e2e:build # isolated .next-e2e build with test-only provider doubles
npm run test:e2e     # end-to-end tests against that isolated build and a disposable DB
npm run typecheck
npm run db:generate  # after editing src/lib/db/schema.ts
npm run db           # approved direct PostgreSQL connection only
```

For realistic page-switching speed, stop `npm run dev` and use `npm run preview`.
The preview uses its own `.next-preview` build directory and the configured database;
it does not enable test providers. Unlike development mode, it precompiles routes
and enables Next.js link preloading. Re-run it after code changes (no hot reload).
Use `PORT` to select another port. Initial connection to a sleeping or distant Neon
database can still take time. Usage-page reads run concurrently, and retention
counts are aggregated in the database instead of loading expired candidate records.

The end-to-end suite signs up, creates an interview, completes a voice interview as a candidate, reviews the report, exports CSV, generates insights, and checks that other accounts can't see your data.

Test doubles live under `e2e/stubs`, outside application source. Only the explicit
local test build aliases providers to them. Normal `npm run build` deployments use
real providers; test aliases are rejected on Vercel/Render and cannot use the
production build directory. The Docker runtime excludes test sources and builds.

**Project map:**

- `src/app/i/[id]`: the candidate page. `src/components/call/candidate-call.tsx` holds the UI and `src/lib/voice-engine.ts` the audio.
- `src/app/api/call/*`: public interview endpoints (start, turn, end, recording, feedback).
- `src/app/dashboard/*`: recruiter app. Mutations live in `src/app/actions.ts`.
- `src/lib/ai/`: Claude prompts and tasks (`prompts.ts`, `tasks.ts`) and the Sarvam client (`sarvam.ts`).
- `src/lib/db/schema.ts` and `drizzle/`: database schema and migrations.

## Known limits

- Accounts are individual workspaces. Team sharing isn't built yet.
- Recordings are stored in Postgres, a few MB each. Move them to object storage at large volume.
- Vercel caps request bodies at 4.5 MB, which holds about 25 minutes of recording at the bitrate used. Self-host for longer interviews.
- Speech runs turn by turn over HTTPS, not as a stream, so expect a short pause before each interviewer reply.

## License

MIT. Volo started as a ground-up rewrite of [FoloUp](https://github.com/foloup/foloup).
