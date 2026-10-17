import type { Analytics, Interview, TranscriptTurn } from "@/lib/db/schema";
import { SILENCE_MARKER } from "@/lib/ai/prompts";

export const RUBRIC_VERSION = "job-evidence-v1";
export const RUBRIC = "0: answer demonstrates no relevant understanding; 1: limited relevant understanding with substantial gaps; 2: adequate understanding with some specifics; 3: strong understanding supported by specific examples and reasoning; 4: exceptional depth with clear trade-offs and outcomes. Unasked, unanswered or unsupported assessments have no score, not zero.";

/** Never display a scored assessment without an exact citation to a candidate turn. */
export function groundAssessment(
  result: Analytics,
  interview: Pick<Interview, "questions">,
  transcript: TranscriptTurn[],
): Analytics {
  const questionSummaries = interview.questions.map((q) => {
    const matches = result.questionSummaries.filter((s) => s.questionId === q.id);
    const proposed = matches.length === 1 ? matches[0] : undefined;
    const evidence = (proposed?.evidence ?? []).filter((e) => {
      const t = transcript[e.turnIndex];
      return Number.isInteger(e.turnIndex) && t?.role === "user" && t.text !== SILENCE_MARKER &&
        e.quote.trim().length >= 8 && t.text.includes(e.quote);
    }).slice(0, 4);
    const score = proposed?.status === "answered" && evidence.length && typeof proposed.score === "number" &&
      Number.isInteger(proposed.score) && proposed.score >= 0 && proposed.score <= 4 ? proposed.score : null;
    return {
      questionId: q.id, question: q.question, status: proposed?.status ?? "not_asked" as const,
      summary: proposed?.summary ?? "No assessment was returned for this question.",
      score, evidence,
      strengths: score !== null ? (proposed?.strengths ?? []).slice(0, 4) : [],
      improvements: score !== null ? (proposed?.improvements ?? []).slice(0, 4) : [],
    };
  });
  const scores = questionSummaries.flatMap((q) => q.score === null ? [] : [q.score]);
  const overallScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 25) : null;
  const recommendation = overallScore === null ? "maybe" : overallScore >= 85 ? "strong_yes" : overallScore >= 65 ? "yes" : overallScore >= 40 ? "maybe" : "no";
  return {
    ...result, rubricVersion: RUBRIC_VERSION, questionSummaries, overallScore, recommendation,
    quotes: result.quotes.filter((q) => q.quote.trim().length >= 8 && transcript.some(
      (t) => t.role === "user" && t.text !== SILENCE_MARKER && t.text.includes(q.quote),
    )),
  };
}
