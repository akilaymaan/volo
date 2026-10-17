# Volo: AI voice interviews in 11 Indian languages

Volo runs first-round hiring interviews for you. Paste a job description and Claude drafts the questions. Share one link, and each candidate has a live voice conversation with an AI interviewer that asks real follow-ups. You get back a scored report with the recording, the transcript, and a question-by-question summary.

**What you get:**

- **An interview editor.** Write the objective, generate questions from a job description (paste it or attach a PDF), then edit, reorder and set follow-ups. Pick an interviewer persona, a language and a length. Add your logo, brand color and an optional invite list. A live preview shows what candidates will see.
- **A candidate page that just works.** A mic check, a consent step, and an audio-reactive interviewer. Live captions and a transcript drawer. Answers end when the candidate pauses (or presses Space). Tab-switch tracking, a server-side time limit, and one attempt per email.
- **Reports.** Overall score and hiring recommendation, a communication score, strengths and gaps, verbatim quotes, a summary for each question, the full recording and transcript, and a candidate status (shortlisted, maybe or rejected).
- **Interview overview.** Completion rate, average score and length, candidate satisfaction, AI insights across all candidates, search and filtering, and CSV export.
- **Interviewer personas.** Four built in (Lisa, Bob, Aarav, Meera), or create your own with a Sarvam voice and sliders for empathy, depth, rapport and pace.
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

> **No keys yet?** Set `AI_MOCK=1` to try the whole product with a scripted interviewer and placeholder voice.

## Invitations, reports and privacy

- Add `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender) to enable email.
  Create an interview, then use its **Invitations** tab to send personal links.
  Links expire after seven days. Resends rotate the token and require a one-minute
  wait; account sends are capped at 100 attempts/hour. "Sent" means the provider
  accepted the message, not that it was delivered or opened.
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
| `AI_MOCK` | off | `1` replaces Claude and Sarvam with deterministic fakes |

## Development

```bash
npm run db:local     # explicitly initialize/migrate local PGlite (server stopped)
npm run dev          # app; no migration side effects
npm test             # unit tests (Vitest)
npm run build        # production build
npm run test:e2e     # full end-to-end flow in Chromium with a fake mic (run after build)
npm run typecheck
npm run db:generate  # after editing src/lib/db/schema.ts
npm run db           # approved direct PostgreSQL connection only
```

The end-to-end suite signs up, creates an interview, completes a voice interview as a candidate, reviews the report, exports CSV, generates insights, and checks that other accounts can't see your data.

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
