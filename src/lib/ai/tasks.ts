import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Analytics, Interview, Interviewer, TranscriptTurn } from "@/lib/db/schema";
import { INTERVIEWER_MODEL, structured } from "./claude";
import { isMock } from "./mock";
import {
  ANALYSIS_SYSTEM,
  INSIGHTS_SYSTEM,
  QUESTIONS_SYSTEM,
  analysisPrompt,
  insightsPrompt,
  interviewerMessages,
  interviewerSystemPrompt,
  questionsPrompt,
} from "./prompts";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

// Structured outputs only hint enums to the model, so accept any string and normalize it here
const oneOf =
  <const T extends readonly string[]>(allowed: T, fallback: T[number]) =>
  (v: string): T[number] => {
    const k = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return (allowed as readonly string[]).includes(k) ? (k as T[number]) : fallback;
  };
const enumText = (allowed: readonly string[]) => z.string().describe(`One of: ${allowed.join(", ")}`);

const RECS = ["strong_yes", "yes", "maybe", "no"] as const;
const SENTIMENTS = ["positive", "neutral", "negative"] as const;
const Q_STATUS = ["answered", "not_answered", "not_asked"] as const;
const QUOTE_TYPES = ["strength", "improvement"] as const;

// ---------- question generation ----------

const QuestionsSchema = z.object({
  questions: z.array(z.string()),
  description: z.string(),
});

export async function generateQuestions(input: {
  name: string;
  objective: string;
  count: number;
  context: string;
  pdf?: { base64: string };
}) {
  if (isMock()) {
    return {
      questions: Array.from(
        { length: input.count },
        (_, i) => `Mock question ${i + 1}: tell me about your experience relevant to ${input.name}?`,
      ),
      description: `You'll chat with an AI interviewer about your background and experience for the ${input.name} role.`,
    };
  }
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  // Claude reads the PDF directly — no server-side PDF parsing needed
  if (input.pdf) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: input.pdf.base64 },
    });
  }
  content.push({ type: "text", text: questionsPrompt(input) });
  const out = await structured(QuestionsSchema, {
    system: QUESTIONS_SYSTEM,
    messages: [{ role: "user", content }],
    effort: "medium",
  });
  return { questions: out.questions.slice(0, input.count), description: out.description };
}

// ---------- live interviewer ----------

const TurnSchema = z.object({ say: z.string(), end: z.boolean() });

export async function interviewerTurn(args: {
  interview: Interview;
  interviewer: Interviewer;
  candidateName: string;
  transcript: TranscriptTurn[];
  elapsedSec: number;
}): Promise<{ say: string; end: boolean }> {
  if (isMock()) {
    const answered = args.transcript.filter((t) => t.role === "user").length;
    const qs = args.interview.questions;
    if (answered === 0)
      return { say: `Hi ${args.candidateName || "there"}! I'm ${args.interviewer.name}. ${qs[0]?.question ?? "Tell me about yourself."}`, end: false };
    if (answered >= Math.min(3, qs.length))
      return { say: "Thank you for your time today. The hiring team will review and follow up. Goodbye!", end: true };
    return { say: `Thanks. ${qs[answered].question}`, end: false };
  }
  return structured(TurnSchema, {
    model: INTERVIEWER_MODEL,
    system: interviewerSystemPrompt(args.interview, args.interviewer, args.candidateName),
    messages: interviewerMessages(args.transcript, args.elapsedSec, args.interview.durationMins),
    effort: "low",
    maxTokens: 4000,
  });
}

// ---------- post-interview analysis ----------

const AnalyticsSchema = z.object({
  overallScore: z.number(),
  recommendation: enumText(RECS),
  overallFeedback: z.string(),
  callSummary: z.string(),
  sentiment: enumText(SENTIMENTS),
  communication: z.object({ score: z.number(), feedback: z.string() }),
  softSkillSummary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  questionSummaries: z.array(
    z.object({
      question: z.string(),
      status: enumText(Q_STATUS),
      summary: z.string(),
    }),
  ),
  quotes: z.array(
    z.object({
      quote: z.string(),
      analysis: z.string(),
      type: enumText(QUOTE_TYPES),
    }),
  ),
});

export async function analyzeTranscript(
  interview: Interview,
  transcript: TranscriptTurn[],
  interviewerName: string,
): Promise<Analytics> {
  if (isMock()) {
    return {
      overallScore: 78,
      recommendation: "yes",
      overallFeedback: "Clear, structured answers with relevant examples. Could go deeper on trade-offs.",
      callSummary: "The candidate discussed their background and recent projects.",
      sentiment: "positive",
      communication: { score: 8, feedback: "Fluent and easy to follow." },
      softSkillSummary: "Confident, adaptable and thoughtful under follow-up questions.",
      strengths: ["Concrete examples", "Clear communication"],
      improvements: ["Discuss trade-offs in more depth"],
      questionSummaries: interview.questions.map((q, i) => ({
        question: q.question,
        status: i < 3 ? "answered" : "not_asked",
        summary: i < 3 ? "Gave a relevant, well-structured answer." : "",
      })),
      quotes: [
        { quote: "This is a mock answer from the candidate.", analysis: "Direct and concise.", type: "strength" },
      ],
    };
  }
  const out = await structured(AnalyticsSchema, {
    system: ANALYSIS_SYSTEM,
    messages: [{ role: "user", content: analysisPrompt(interview, transcript, interviewerName) }],
    effort: "medium",
  });
  return {
    ...out,
    overallScore: clamp(out.overallScore, 0, 100),
    recommendation: oneOf(RECS, "maybe")(out.recommendation),
    sentiment: oneOf(SENTIMENTS, "neutral")(out.sentiment),
    communication: { ...out.communication, score: clamp(out.communication.score, 0, 10) },
    questionSummaries: out.questionSummaries.map((q) => ({ ...q, status: oneOf(Q_STATUS, "answered")(q.status) })),
    quotes: out.quotes.map((q) => ({ ...q, type: oneOf(QUOTE_TYPES, "strength")(q.type) })),
  };
}

// ---------- cohort insights ----------

const InsightsSchema = z.object({ insights: z.array(z.string()) });

export async function generateInsights(
  interview: Interview,
  rows: { summary: string; score: number; recommendation: string }[],
) {
  if (isMock()) {
    return [
      "Most candidates explain their past projects clearly with concrete examples.",
      "Depth on system design trade-offs is the most common gap.",
      "Communication scores are consistently strong across the pool.",
    ];
  }
  const out = await structured(InsightsSchema, {
    system: INSIGHTS_SYSTEM,
    messages: [{ role: "user", content: insightsPrompt(interview, rows) }],
    effort: "medium",
  });
  return out.insights.slice(0, 5);
}
