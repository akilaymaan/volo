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
npm run dev
```

Open <http://localhost:3000> and create an account. The database is created automatically in `./.data`, so there's no extra step.

> **No keys yet?** Set `AI_MOCK=1` to try the whole product with a scripted interviewer and placeholder voice.

## Deploying

### Vercel (recommended)

1. Create a Postgres database (Supabase, Neon or similar) and copy its connection string.
2. Import the repo in Vercel and set the environment variables: `ANTHROPIC_API_KEY`, `SARVAM_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your production URL), and `DATABASE_URL`.
3. Deploy. Migrations run automatically during `npm run build`.

> The embedded database is for local and single-server use. Serverless platforms need `DATABASE_URL`.

### Docker

```bash
docker build -t volo .
docker run -p 3000:3000 --env-file .env.local -v volo-data:/app/.data volo
```

Migrations run on start. Without `DATABASE_URL`, data is kept in the mounted `/app/.data` volume.

### Any Node server

```bash
npm ci && npm run build && npm start   # migrations run on build and start
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
| `DATABASE_URL` | embedded Postgres | Any Postgres connection string |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Question generation, scoring, insights |
| `CLAUDE_INTERVIEWER_MODEL` | `claude-haiku-5-5` | The live interviewer. A fast model keeps the wait between turns short |
| `SARVAM_STT_MODEL` | `saaras:v4` | Speech-to-text model |
| `SARVAM_TTS_MODEL` | `bulbul:v3` | Text-to-speech model |
| `AI_MOCK` | off | `1` replaces Claude and Sarvam with deterministic fakes |

## Development

```bash
npm run dev          # app + embedded database
npm test             # unit tests (Vitest)
npm run build        # production build
npm run test:e2e     # full end-to-end flow in Chromium with a fake mic (run after build)
npm run typecheck
npm run db:generate  # after editing src/lib/db/schema.ts
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
