import { describe, expect, it } from "vitest";
import { decodeInterviewDraft, guidedStepError, INTERVIEW_DRAFT_MAX_BYTES, INTERVIEW_DRAFT_TTL, interviewDraftKey, writeInterviewDraft, type InterviewDraftState } from "@/lib/interview-draft";

const state = (): InterviewDraftState => ({
  values: { name: "", objective: "", description: "", interviewerId: "p1", language: "en-IN", durationMins: 10, questions: [], isAnonymous: false, themeColor: "#111111", logoUrl: "", allowedEmails: [], invitationOnly: false, retentionDays: 90 },
  context: "", count: 5, emailsText: "", guided: true, step: 1, attachmentName: "",
});
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } } as Storage;
}
describe("local interview drafts", () => {
  it("round trips incomplete role/questions and every editor setting without requiring creation-valid content", () => {
    const saved = state();
    saved.values.questions.push({ id: "q1", question: "", followUps: 3 });
    saved.values.isAnonymous = true; saved.values.retentionDays = 30;
    saved.guided = false; saved.step = 2; saved.context = "Role notes";
    saved.attachmentName = "role.pdf"; saved.emailsText = "unfinished-address";
    const store = storage();
    const raw = writeInterviewDraft(store, "draft", null, saved);
    expect(decodeInterviewDraft(raw)).toEqual(saved);
  });
  it("separates owners, sources and ambiguous delimiters", () => {
    expect(new Set([interviewDraftKey("a", "new"), interviewDraftKey("b", "new"), interviewDraftKey("a", "template:x"), interviewDraftKey("a:new", "x"), interviewDraftKey("a", "new:x")]).size).toBe(5);
  });
  it("rejects expired, future, unsupported, malformed, oversized and unsafe draft values", () => {
    const now = Date.now();
    const pack = (data = state(), updatedAt = now, version = 1) => JSON.stringify({ state: data, updatedAt, version });
    expect(decodeInterviewDraft(pack(), now)).not.toBeNull();
    for (const raw of ["bad", "{}", pack(state(), now - INTERVIEW_DRAFT_TTL), pack(state(), now + 61_000), pack(state(), now, 2), "x".repeat(INTERVIEW_DRAFT_MAX_BYTES + 1), pack({ ...state(), step: 4 } as unknown as InterviewDraftState), pack({ ...state(), values: { ...state().values, logoUrl: "javascript:alert(1)" } }), pack({ ...state(), values: { ...state().values, language: "invalid" } })])
      expect(decodeInterviewDraft(raw, now)).toBeNull();
  });
  it("does not overwrite another tab, but allows successive writes from the same editor", () => {
    const store = storage();
    const first = writeInterviewDraft(store, "draft", null, state());
    const next = state(); next.values.name = "Changed elsewhere";
    const second = writeInterviewDraft(store, "draft", first, next);
    expect(() => writeInterviewDraft(store, "draft", first, state())).toThrow("conflict");
    expect(store.getItem("draft")).toBe(second);
    expect(() => writeInterviewDraft(store, "draft", second, state())).not.toThrow();
  });
  it("propagates unavailable/quota-limited storage rather than claiming a save", () => {
    const store = storage(); store.setItem = () => { throw new Error("quota"); };
    expect(() => writeInterviewDraft(store, "draft", null, state())).toThrow("quota");
  });
  it("gates steps without generating questions or creating an interview", () => {
    const saved = state();
    expect(guidedStepError(saved, 1)).toContain("name and objective");
    saved.values.name = "Engineer"; saved.values.objective = "Assess skills";
    expect(guidedStepError(saved, 1)).toBe("");
    expect(guidedStepError(saved, 2)).toContain("at least one question");
    saved.values.questions = [{ id: "q", question: "  ", followUps: 1 }];
    expect(guidedStepError(saved, 2)).not.toBe("");
    saved.values.questions[0].question = "Describe your work";
    saved.values.interviewerId = "";
    expect(guidedStepError(saved, 2)).toContain("interviewer");
    saved.values.interviewerId = "p1";
    expect(guidedStepError(saved, 2)).toBe("");
  });
});
