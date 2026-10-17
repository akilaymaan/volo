import { expect, it } from "vitest";
import { comparableResponses } from "@/lib/comparison";
import type { Analytics, InterviewSnapshot } from "@/lib/db/schema";

const snapshot: InterviewSnapshot = { name: "Role", objective: "Relevant knowledge", language: "en-IN", durationMins: 10, questions: [{ id: "q", question: "Why?", followUps: 1 }] };
const row = { interviewId: "same-role", interviewSnapshot: snapshot, analytics: { rubricVersion: "v1" } as Analytics };

it("compares only the same interview, questions, configuration and rubric version", () => {
  expect(comparableResponses([row, { ...row }])).toBe(true);
  expect(comparableResponses([row, { ...row, interviewId: "other-role" }])).toBe(false);
  expect(comparableResponses([row, { ...row, interviewSnapshot: null }])).toBe(false);
  expect(comparableResponses([row, { ...row, analytics: {} as Analytics }])).toBe(false);
  expect(comparableResponses([row, { ...row, interviewSnapshot: { ...snapshot, objective: "Changed" } }])).toBe(false);
  expect(comparableResponses([row])).toBe(false);
  expect(comparableResponses(Array(5).fill(row))).toBe(false);
});
