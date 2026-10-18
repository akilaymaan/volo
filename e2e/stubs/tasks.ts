// Test-build-only provider double. Never imported by the production application.
import type { Analytics, Interview, Interviewer, TranscriptTurn } from "../../src/lib/db/schema";
import { groundAssessment } from "../../src/lib/evaluation";

export async function generateQuestions(input: { name: string; count: number }) {
  return {
    questions: Array.from({ length: input.count }, (_, i) => `Test question ${i + 1}: tell me about your experience relevant to ${input.name}?`),
    description: `A conversation about your experience for the ${input.name} role.`,
  };
}

export async function interviewerTurn(args: { interview: Interview; interviewer: Interviewer; candidateName: string; transcript: TranscriptTurn[] }) {
  const answered = args.transcript.filter((t) => t.role === "user").length;
  const qs = args.interview.questions;
  if (!answered) return { say: `Hi ${args.candidateName || "there"}! I'm ${args.interviewer.name}. ${qs[0]?.question ?? "Tell me about yourself."}`, end: false };
  if (answered >= Math.min(3, qs.length)) return { say: "Thank you for your time. Goodbye!", end: true };
  return { say: `Thanks. ${qs[answered].question}`, end: false };
}

export async function analyzeTranscript(interview: Interview, transcript: TranscriptTurn[]): Promise<Analytics> {
  const candidates = transcript.map((t, i) => ({ ...t, i })).filter((t) => t.role === "user" && t.text !== "[no response]");
  return groundAssessment({
    overallScore: 78, recommendation: "yes", overallFeedback: "Relevant examples with clear explanations.",
    callSummary: "The candidate discussed their experience.", sentiment: "positive",
    communication: { score: 8, feedback: "Clear explanations." }, softSkillSummary: "Provided concrete examples.",
    strengths: ["Concrete examples"], improvements: ["Explain trade-offs"],
    questionSummaries: interview.questions.map((q, i) => ({
      questionId: q.id, question: q.question, status: candidates[i] ? "answered" : "not_asked",
      summary: candidates[i] ? "Gave a relevant answer." : "", score: candidates[i] ? 3 : null,
      evidence: candidates[i] ? [{ turnIndex: candidates[i].i, quote: candidates[i].text }] : [],
      strengths: [], improvements: [],
    })),
    quotes: candidates[0] ? [{ quote: candidates[0].text, analysis: "Relevant example.", type: "strength" }] : [],
  }, interview, transcript);
}

export async function generateInsights() {
  return ["Communication scores are consistently strong across the pool."];
}
