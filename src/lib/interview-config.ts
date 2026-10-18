import type { Interview, InterviewConfig } from "@/lib/db/schema";

/** Explicit projection: never copy credentials, allowlists, insights or candidate data. */
export function reusableInterviewConfig(iv: Interview): InterviewConfig {
  return {
    name: iv.name,
    objective: iv.objective,
    description: iv.description,
    interviewerId: iv.interviewerId,
    language: iv.language,
    durationMins: iv.durationMins,
    questions: iv.questions.map((q) => ({ id: q.id, question: q.question, followUps: q.followUps })),
    isAnonymous: iv.isAnonymous,
    themeColor: iv.themeColor,
    logoUrl: iv.logoUrl,
    // Keep restricted intake restricted even though its recipient list is not reused.
    invitationOnly: iv.invitationOnly || iv.allowedEmails.length > 0,
    retentionDays: iv.retentionDays,
  };
}
