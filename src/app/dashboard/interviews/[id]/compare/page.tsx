import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { comparableResponses } from "@/lib/comparison";
import { getOwnedInterview, getOwnedResponse } from "@/lib/data";
import { notFound } from "next/navigation";
import { RUBRIC } from "@/lib/evaluation";

export const metadata = { title: "Compare candidates" };

export default async function ComparePage(props: PageProps<"/dashboard/interviews/[id]/compare">) {
  const user = await requireUser();
  const { id } = await props.params;
  const iv = await getOwnedInterview(id, user.id);
  const params = await props.searchParams;
  const ids = [...new Set(typeof params.candidate === "string" ? [params.candidate] : params.candidate ?? [])];
  if (ids.length < 2 || ids.length > 4) return <p>Select between two and four candidates from the interview dashboard.</p>;
  const records = await Promise.all(ids.map((responseId) => getOwnedResponse(responseId, user.id)));
  if (records.some((r) => r.interview.id !== id || r.response.status !== "completed")) notFound();
  const rows = records.map((r) => r.response);
  return (
    <>
      <Link href={`/dashboard/interviews/${id}`} className="text-sm underline">Back to {iv.name}</Link>
      <h1 className="mt-4 text-3xl font-bold">Compare candidates</h1>
      <p className="my-4 text-sm text-muted-foreground">AI decision support only. Review supporting evidence before any hiring decision. Missing assessments are not zero scores. Compare coverage as well as scores.</p>
      {!comparableResponses(rows) ? (
        <p className="rounded-xl border p-5">These reports do not share the same question set, objective, language, duration and rubric version. Compare candidates from the same interview version. Historical responses without an interview snapshot cannot be compared.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card" role="region" aria-label="Candidate comparison table" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-4">Criterion</th>{rows.map((r) => <th key={r.id} className="min-w-60 p-4">
              <Link className="underline" href={`/dashboard/interviews/${id}/responses/${r.id}`}>{r.name || "Anonymous candidate"}</Link>
            </th>)}</tr></thead>
            <tbody>
              <tr><th className="p-4">Evidence-backed score</th>{rows.map((r) => <td key={r.id} className="p-4">{r.analytics!.overallScore === null ? "Not assessed" : `${r.analytics!.overallScore} / 100`}</td>)}</tr>
              <tr><th className="p-4">Coverage</th>{rows.map((r) => <td key={r.id} className="p-4">{r.analytics!.questionSummaries.filter((q) => q.score != null).length} / {r.analytics!.questionSummaries.length} assessed</td>)}</tr>
              {rows[0].analytics!.questionSummaries.map((q, i) => <tr key={q.questionId} className="border-t">
                <th className="p-4 align-top">{q.question}</th>
                {rows.map((r) => {
                  const assessment = r.analytics!.questionSummaries[i];
                  return <td key={r.id} className="p-4 align-top">
                    <p className="font-semibold">{assessment.score == null ? "Not assessed" : `${assessment.score} / 4`}</p>
                    <p className="mt-2">{assessment.summary}</p>
                    {assessment.evidence?.map((e, n) => <Link key={n} className="mt-2 block underline" href={`/dashboard/interviews/${id}/responses/${r.id}#turn-${e.turnIndex}`}>&ldquo;{e.quote}&rdquo;</Link>)}
                  </td>;
                })}
              </tr>)}
            </tbody>
          </table>
          <p className="border-t p-4 text-xs text-muted-foreground">{RUBRIC}</p>
        </div>
      )}
    </>
  );
}
