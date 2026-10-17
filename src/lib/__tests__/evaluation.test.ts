import { expect, it } from "vitest";
import { groundAssessment, RUBRIC_VERSION } from "@/lib/evaluation";
import type { Analytics, TranscriptTurn } from "@/lib/db/schema";

const questions = [{ id: "q1", question: "Explain the trade-off", followUps: 1 }];
const transcript: TranscriptTurn[] = [
  { role: "agent", text: "Explain the trade-off", at: 0 },
  { role: "user", text: "I chose a queue to handle burst traffic.", at: 1 },
];
const base: Analytics = {
  overallScore: 99, recommendation: "strong_yes", overallFeedback: "", callSummary: "",
  sentiment: "neutral", communication: { score: 5, feedback: "" }, softSkillSummary: "",
  strengths: [], improvements: [], quotes: [],
  questionSummaries: [{
    questionId: "q1", question: "Untrusted text", status: "answered", summary: "Used a queue",
    score: 3, evidence: [{ turnIndex: 1, quote: "a queue to handle burst traffic" }],
    strengths: ["Capacity planning"], improvements: ["Explain retry semantics"],
  }],
};

it("anchors scores to stable question IDs, exact candidate text, and the fixed rubric", () => {
  const result = groundAssessment(base, { questions }, transcript);
  expect(result.rubricVersion).toBe(RUBRIC_VERSION);
  expect(result.overallScore).toBe(75);
  expect(result.recommendation).toBe("yes");
  expect(result.questionSummaries[0].question).toBe(questions[0].question);
  expect(result.questionSummaries[0].evidence).toHaveLength(1);
});

it.each([
  { turnIndex: 0, quote: "Explain the trade-off" },
  { turnIndex: 1, quote: "I invented this quote" },
  { turnIndex: 999, quote: "Out of bounds" },
  { turnIndex: -1, quote: "Negative index" },
])("rejects unsupported evidence: %j", (evidence) => {
  const result = groundAssessment({
    ...base, questionSummaries: [{ ...base.questionSummaries[0], evidence: [evidence] }],
  }, { questions }, transcript);
  expect(result.questionSummaries[0].score).toBeNull();
  expect(result.questionSummaries[0].strengths).toEqual([]);
  expect(result.overallScore).toBeNull();
  expect(result.recommendation).toBe("maybe");
});

it("does not score missing, duplicate, unanswered, or out-of-range assessments", () => {
  const row = base.questionSummaries[0];
  for (const summaries of [[], [row, row], [{ ...row, score: 5 }], [{ ...row, status: "not_answered" as const }]]) {
    expect(groundAssessment({ ...base, questionSummaries: summaries }, { questions }, transcript).questionSummaries[0].score).toBeNull();
  }
});
