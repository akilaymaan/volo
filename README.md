# Volo: AI voice interviews in 11 Indian languages

Volo runs first-round hiring interviews for you. Paste a job description and Claude drafts the questions. Share one link, and each candidate has a live voice conversation with an AI interviewer that asks real follow-ups. You get back a scored report with the recording, the transcript, and a question-by-question summary.

**What you get:**

- **An interview editor.** Write the objective, generate questions from a job description (paste it or attach a PDF), then edit, reorder and set follow-ups. Pick an interviewer persona, a language and a length. Add your logo, brand color and an optional invite list. A live preview shows what candidates will see.
- **A candidate page that just works.** A mic check, a consent step, and an audio-reactive interviewer. Live captions and a transcript drawer. Answers end when the candidate pauses (or presses Space). Tab-switch tracking, a server-side time limit, and one attempt per email.
- **Reports.** Overall score and hiring recommendation, a communication score, strengths and gaps, verbatim quotes, a summary for each question, the full recording and transcript, and a candidate status (shortlisted, maybe or rejected).
- **Interview overview.** Completion rate, average score and length, candidate satisfaction, AI insights across all candidates, search and filtering, and CSV export.
- **Bulk candidate review.** Select up to 100 candidates in an interview and confirm a shared review status: Shortlisted, Maybe, Rejected or Not reviewed. Search/status filter changes clear selection, and the confirmation lists the affected candidates. Ownership, completed responses and expected statuses are checked atomically; missing or changed candidates reject the whole batch. No emails are sent and AI scores are unchanged.
- **Interviewer personas.** Four built in (Lisa, Bob, Aarav, Meera), or create your own with a Sarvam voice and sliders for empathy, depth, rapport and pace.
- **Personal templates and duplication.** From an interview's **More actions** menu, save its current settings as a named template or open a duplicate in the editor. Use **Templates** in the sidebar to start a new interview or delete a template. Each copy is independent: candidate emails, invitations, responses, recordings and insights are excluded. Restricted intake stays restricted and needs new invitations. A template survives deletion of its source interview; deleting it keeps existing interviews. If its custom interviewer has been deleted, choose a replacement before saving.
- **Audio-linked evidence.** New recorded interviews capture turn-level audio positions. Click a transcript timestamp or a question's evidence link to play the relevant segment; the current transcript turn is highlighted during playback. Older recordings remain playable with plain transcript links when timing was not captured.
- Dark mode, mobile layouts, keyboard support, and reduced-motion support.

## Quick start (about 2 minutes)

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
  **Usage and privacy** previews expired records and offers confirmed deletion.
  Deleting a response removes its recording, linked survey feedback, invitation,
  attempt claim and cached cohort insights. Usage counts survive without a response
  identifier. Legacy responses are not assigned invented consent or deletion dates.

For scheduled retention, deployment requirements, limitations and verification,
see [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

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
npm test             # unit tests (Vitest)
npm run build        # production build
npm run test:e2e:build # isolated .next-e2e build with test-only provider doubles
npm run test:e2e     # end-to-end tests against that isolated build and a disposable DB
npm run typecheck
npm run db:generate  # after editing src/lib/db/schema.ts
npm run db           # approved direct PostgreSQL connection only
```

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
