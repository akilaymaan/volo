import { eq } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon, Loader2Icon, QuoteIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RecordingPlayer, ResponseControls } from "@/components/response-controls";
import { ScoreRing } from "@/components/score";
import { PersonaDot } from "@/components/voice-orb";
import { requireUser } from "@/lib/auth";
import { RECOMMENDATIONS } from "@/lib/constants";
import { getInterviewer, getOwnedResponse } from "@/lib/data";
import { analysisState, fmtDuration } from "@/lib/format";
import { db } from "@/lib/db";
import { response as responseTable } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

// Covers analyses and insights started from this page via after() / server actions
export const maxDuration = 300;

export const metadata = { title: "Candidate report" };

const STATUS_CHIP = {
  answered: { label: "Answered", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  not_answered: { label: "Not answered", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  not_asked: { label: "Not asked", className: "bg-muted text-muted-foreground" },
};

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}>
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export default async function ResponsePage(props: PageProps<"/dashboard/interviews/[id]/responses/[responseId]">) {
  const { id, responseId } = await props.params;
  const user = await requireUser();
  const { response: r, interview: iv } = await getOwnedResponse(responseId, user.id);
  if (iv.id !== id) notFound();
  if (!r.isViewed) await db.update(responseTable).set({ isViewed: true }).where(eq(responseTable.id, r.id));
  const persona = await getInterviewer(iv.interviewerId);
  const a = r.analytics;
  const state = analysisState(r);
  const analyzing = state === "running";
  const rec = a ? RECOMMENDATIONS[a.recommendation] : null;

  return (
    <>
      <AutoRefresh when={analyzing} />
      <Link href={`/dashboard/interviews/${iv.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> {iv.name}
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{r.name || "Anonymous candidate"}</h1>
          <p className="text-sm text-muted-foreground">
            {r.email && <a href={`mailto:${r.email}`} className="underline-offset-4 hover:underline">{r.email}</a>}
            {r.email && ", "}
            {r.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}, {fmtDuration(r.durationSec)}
          </p>
          {r.tabSwitchCount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangleIcon className="size-4" /> Left the interview tab {r.tabSwitchCount} time{r.tabSwitchCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <ResponseControls
          responseId={r.id}
          interviewId={iv.id}
          status={r.candidateStatus}
          canReanalyze={!analyzing && r.transcript.some((t) => t.role === "user")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {analyzing ? (
            <Card>
              <div className="flex items-center gap-3 py-6">
                <Loader2Icon className="size-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Claude is reviewing this interview</p>
                  <p className="text-sm text-muted-foreground">This usually takes under a minute. The page updates on its own.</p>
                </div>
              </div>
            </Card>
          ) : !a ? (
            <Card>
              <p className="py-4 text-muted-foreground">
                {state === "failed"
                  ? "The analysis failed. Check your ANTHROPIC_API_KEY and use Re-analyze."
                  : "The candidate didn't answer any questions, so there's nothing to analyze."}
              </p>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <div className="flex justify-center gap-6">
                    <ScoreRing score={a.overallScore} label="Overall" />
                    <ScoreRing score={a.communication.score} max={10} label="Communication" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-heading text-xl font-semibold", rec?.className)}>{rec?.label}</p>
                    <p className="mt-2">{a.overallFeedback}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{a.softSkillSummary}</p>
                  </div>
                </div>
              </Card>

              <div className="grid gap-6 sm:grid-cols-2">
                <Card title="Strengths">
                  <ul className="space-y-2">
                    {a.strengths.map((s) => (
                      <li key={s} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card title="To probe further">
                  <ul className="space-y-2">
                    {a.improvements.map((s) => (
                      <li key={s} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <Card title="Communication">
                <p>{a.communication.feedback}</p>
                {a.quotes.length > 0 && (
                  <div className="mt-5 space-y-4">
                    {a.quotes.map((q) => (
                      <figure key={q.quote} className={cn("border-l-2 pl-4", q.type === "strength" ? "border-emerald-500" : "border-signal")}>
                        <blockquote className="flex gap-2 italic">
                          <QuoteIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                          {q.quote}
                        </blockquote>
                        <figcaption className="mt-1 text-sm text-muted-foreground">{q.analysis}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Question by question">
                <ol className="space-y-5">
                  {a.questionSummaries.map((q, i) => (
                    <li key={`${i}-${q.question}`} className="flex gap-3">
                      <span className="w-5 shrink-0 text-right font-heading font-semibold text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium">{q.question}</p>
                        <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CHIP[q.status].className)}>
                          {STATUS_CHIP[q.status].label}
                        </span>
                        {q.summary && <p className="mt-2 text-muted-foreground">{q.summary}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card title="Recording">
            {r.hasRecording ? (
              <RecordingPlayer responseId={r.id} />
            ) : (
              <p className="text-sm text-muted-foreground">No recording was uploaded for this interview.</p>
            )}
          </Card>
          <Card title="Transcript">
            {r.transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversation was recorded.</p>
            ) : (
              <ol className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {r.transcript.map((t, i) => (
                  <li key={i} className="flex gap-2.5">
                    {t.role === "agent" && persona ? (
                      <PersonaDot color={persona.color} name={persona.name} size={26} />
                    ) : (
                      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                        {(r.name || "C").charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t.role === "agent" ? persona?.name ?? "Interviewer" : r.name || "Candidate"}
                      </p>
                      <p className="text-sm">{t.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
