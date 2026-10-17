import type { Response } from "@/lib/db/schema";

export function comparableResponses(rows: Pick<Response, "interviewId" | "interviewSnapshot" | "analytics">[]) {
  if (rows.length < 2 || rows.length > 4) return false;
  const first = rows[0];
  if (!first.interviewSnapshot || !first.analytics?.rubricVersion) return false;
  const signature = (r: typeof first) => JSON.stringify({
    objective: r.interviewSnapshot?.objective,
    questions: r.interviewSnapshot?.questions,
    language: r.interviewSnapshot?.language,
    durationMins: r.interviewSnapshot?.durationMins,
    rubric: r.analytics?.rubricVersion,
  });
  return rows.every((r) => r.interviewId === first.interviewId && !!r.interviewSnapshot &&
    !!r.analytics?.rubricVersion && signature(r) === signature(first));
}
