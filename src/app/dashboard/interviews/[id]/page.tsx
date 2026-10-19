import { ArrowLeftIcon, LightbulbIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { refreshInsightsAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { InterviewActions } from "@/components/interview-actions";
import { InvitationManager } from "@/components/invitation-manager";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { type ResponseRow, ResponsesTable } from "@/components/responses-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PersonaDot } from "@/components/voice-orb";
import { requireUser } from "@/lib/auth";
import { languageLabel } from "@/lib/constants";
import { emailConfigurationIssue } from "@/lib/email-config";
import { analysisState, fmtDuration } from "@/lib/format";
import {
  finalizeStale,
  getInterviewer,
  getOwnedInterview,
  interviewStats,
  listResponses,
  runAnalysis,
} from "@/lib/data";

// Covers analyses and insights started from this page via after() / server actions
export const maxDuration = 300;

export async function generateMetadata(props: PageProps<"/dashboard/interviews/[id]">) {
  const user = await requireUser();
  const iv = await getOwnedInterview((await props.params).id, user.id);
  return { title: iv.name };
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function InterviewPage(props: PageProps<"/dashboard/interviews/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  const iv = await getOwnedInterview(id, user.id);

  const stale = await finalizeStale(iv);
  if (stale.length) after(() => Promise.all(stale.map(runAnalysis)));

  const [responses, stats, persona] = await Promise.all([
    listResponses(id),
    interviewStats(id),
    getInterviewer(iv.interviewerId),
  ]);

  const rows: ResponseRow[] = responses.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.createdAt.toISOString(),
    durationSec: r.durationSec,
    score: r.analytics?.overallScore ?? null,
    recommendation: r.analytics?.recommendation ?? null,
    analysisStatus: analysisState(r),
    candidateStatus: r.candidateStatus,
    tabSwitchCount: r.tabSwitchCount,
    isViewed: r.isViewed,
  }));
  const analyzing = rows.some((r) => r.analysisStatus === "running");
  const invites = await db.select({
    id: invitation.id, email: invitation.email, status: invitation.status,
    expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt, sendCount: invitation.sendCount,
  }).from(invitation).where(eq(invitation.interviewId, id));
  const analyzed = rows.filter((r) => r.score != null).length;
  const completionRate = stats.started ? Math.round((stats.completed / stats.started) * 100) : null;

  return (
    <>
      <AutoRefresh when={analyzing} />
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Interviews
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {persona && <PersonaDot color={persona.color} name={persona.name} size={44} />}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">{iv.name}</h1>
            <p className="text-sm text-muted-foreground">
              {persona?.name}, {languageLabel(iv.language)}, {iv.durationMins} min, {iv.questions.length} questions
            </p>
          </div>
        </div>
        <Suspense>
          <InterviewActions id={iv.id} name={iv.name} isActive={iv.isActive} invitationOnly={iv.invitationOnly || !!iv.allowedEmails.length} />
        </Suspense>
      </div>

      <div className="mb-8 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl border bg-card sm:grid-cols-4 sm:divide-y-0">
        <Stat label="Responses" value={stats.completed} hint={completionRate != null ? `${completionRate}% of starts finished` : "No starts yet"} />
        <Stat label="Average score" value={stats.avgScore ?? "–"} hint={analyzed ? `${analyzed} analyzed` : undefined} />
        <Stat
          label="Average length"
          value={stats.avgDuration != null ? fmtDuration(stats.avgDuration) : "–"}
          hint={`of ${iv.durationMins} min planned`}
        />
        <Stat
          label="Candidate rating"
          value={stats.rating != null ? `${stats.rating} / 5` : "–"}
          hint={stats.ratingCount ? `${stats.ratingCount} ratings` : "From the post-interview survey"}
        />
      </div>

      <Tabs defaultValue="responses">
        <TabsList>
          <TabsTrigger value="responses">Candidates</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          {!iv.isAnonymous && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
        </TabsList>

        <TabsContent value="responses" className="mt-4">
          <ResponsesTable interviewId={iv.id} rows={rows} />
          {responses.length >= 2 && <form action={`/dashboard/interviews/${iv.id}/compare`} className="mt-6 rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Compare candidates</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose 2–4 reports from this interview. Different question/rubric versions cannot be compared.</p>
            <div className="my-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
              {responses.filter((r) => r.analytics).map((r) => <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="candidate" value={r.id} /> {r.name || "Anonymous candidate"}
              </label>)}
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Compare selected</button>
          </form>}
        </TabsContent>

        {!iv.isAnonymous && <TabsContent value="invitations" className="mt-4">
          <InvitationManager interviewId={iv.id} setupError={emailConfigurationIssue()} rows={invites.map((r) => ({
            id: r.id, email: r.email, status: !r.revokedAt && r.expiresAt < new Date() && !["started", "completed"].includes(r.status) ? "expired" : r.status,
            expiresAt: r.expiresAt.toISOString(), revoked: !!r.revokedAt, sendCount: r.sendCount,
          }))} />
        </TabsContent>}

        <TabsContent value="insights" className="mt-4">
          <div className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Across all candidates</h2>
                <p className="text-sm text-muted-foreground">
                  {iv.insightsUpdatedAt
                    ? `Updated ${iv.insightsUpdatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                    : "Patterns Claude finds across every analyzed interview."}
                </p>
              </div>
              <ActionButton
                action={refreshInsightsAction.bind(null, iv.id)}
                success="Insights updated"
                disabled={analyzed === 0}
              >
                <RefreshCwIcon /> {iv.insights.length ? "Refresh insights" : "Generate insights"}
              </ActionButton>
            </div>
            {iv.insights.length ? (
              <ul className="mt-5 space-y-3">
                {iv.insights.map((t) => (
                  <li key={t} className="flex gap-3">
                    <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-signal" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                {analyzed === 0
                  ? "Insights appear once at least one interview has been analyzed."
                  : "Generate insights to see common strengths and gaps."}
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <div className="rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Objective</h2>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{iv.objective}</p>
            <h2 className="mt-6 text-lg font-semibold">Questions</h2>
            <ol className="mt-3 space-y-3">
              {iv.questions.map((q, i) => (
                <li key={q.id} className="flex gap-3">
                  <span className="w-5 shrink-0 text-right font-heading font-semibold text-muted-foreground">{i + 1}</span>
                  <span>
                    {q.question}
                    <span className="block text-xs text-muted-foreground">
                      {q.followUps === 0 ? "No follow-ups" : `Up to ${q.followUps} follow-up${q.followUps > 1 ? "s" : ""}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
