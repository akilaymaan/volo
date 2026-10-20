import { z } from "zod";
import { LANGUAGES } from "@/lib/constants";

export const INTERVIEW_DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;
export const INTERVIEW_DRAFT_MAX_BYTES = 1_500_000;
const input = z.object({
  name: z.string().max(120), objective: z.string().max(4000), description: z.string().max(1000),
  interviewerId: z.string().max(100), language: z.enum(LANGUAGES.map((l) => l.code) as [string, ...string[]]),
  durationMins: z.number().int().min(3).max(60),
  questions: z.array(z.object({ id: z.string().min(1).max(40), question: z.string().max(500), followUps: z.number().int().min(0).max(3) })).max(25)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length),
  isAnonymous: z.boolean(), invitationOnly: z.boolean(), themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoUrl: z.string().max(400_000).refine((s) => s === "" || /^https:\/\//.test(s) || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s)),
  allowedEmails: z.array(z.string().max(320)).max(5000), retentionDays: z.number().int().min(0).max(3650),
});
export const interviewDraftState = z.object({
  values: input, context: z.string().max(30_000), count: z.number().int().min(1).max(15),
  emailsText: z.string().max(500_000), step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  guided: z.boolean(), attachmentName: z.string().max(255),
});
export type InterviewDraftState = z.infer<typeof interviewDraftState>;

export function interviewDraftKey(ownerId: string, source: string) {
  return `volo:interview-draft:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(source)}`;
}

export function decodeInterviewDraft(raw: string, now = Date.now()): InterviewDraftState | null {
  if (raw.length > INTERVIEW_DRAFT_MAX_BYTES) return null;
  try {
    const result = z.object({ version: z.literal(1), updatedAt: z.number().finite(), state: interviewDraftState }).safeParse(JSON.parse(raw));
    if (!result.success || result.data.updatedAt > now + 60_000 || now - result.data.updatedAt >= INTERVIEW_DRAFT_TTL) return null;
    return result.data.state;
  } catch { return null; }
}

/** Compare-before-write prevents another open tab's draft being silently replaced. */
export function writeInterviewDraft(storage: Storage, key: string, expected: string | null, state: InterviewDraftState) {
  if (storage.getItem(key) !== expected) throw new Error("conflict");
  const raw = JSON.stringify({ version: 1, updatedAt: Date.now(), state: interviewDraftState.parse(state) });
  if (raw.length > INTERVIEW_DRAFT_MAX_BYTES) throw new Error("size");
  storage.setItem(key, raw);
  return raw;
}

export function guidedStepError(state: InterviewDraftState, through: 1 | 2) {
  const v = state.values;
  if (!v.name.trim() || !v.objective.trim()) return "Add an interview name and objective to continue.";
  if (through === 2) {
    if (!v.questions.length || v.questions.some((q) => !q.question.trim())) return "Add at least one question and fill in every question before continuing.";
    if (!v.interviewerId) return "Choose an interviewer before continuing.";
  }
  return "";
}
