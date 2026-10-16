"use server";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { generateQuestions } from "@/lib/ai/tasks";
import { requireUser } from "@/lib/auth";
import { AVATAR_COLORS, LANGUAGES, VOICES } from "@/lib/constants";
import { db } from "@/lib/db";
import { interview, interviewer, response } from "@/lib/db/schema";
import {
  getOwnedInterview,
  getOwnedResponse,
  getUsableInterviewer,
  refreshInsights,
  runAnalysis,
} from "@/lib/data";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => {
  unstable_rethrow(e); // let redirect()/notFound() through
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
};

// ---------- interviews ----------

const languageCodes = LANGUAGES.map((l) => l.code) as [string, ...string[]];

const logoSchema = z
  .string()
  .max(400_000, "Logo is too large (max ~300 KB)")
  .refine(
    (v) => v === "" || /^https:\/\//.test(v) || /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(v),
    "Logo must be an https URL or an uploaded image",
  );

const InterviewInput = z.object({
  name: z.string().trim().min(1, "Give the interview a name").max(120),
  objective: z.string().trim().min(1, "Describe the objective").max(4000),
  description: z.string().trim().max(1000),
  interviewerId: z.string().min(1, "Pick an interviewer"),
  language: z.enum(languageCodes),
  durationMins: z.number().int().min(3).max(60),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        question: z.string().trim().min(1, "Questions can't be empty").max(500),
        followUps: z.number().int().min(0).max(3),
      }),
    )
    .min(1, "Add at least one question")
    .max(25),
  isAnonymous: z.boolean(),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color"),
  logoUrl: logoSchema,
  allowedEmails: z.array(z.string().trim().toLowerCase().email("Invalid email in allowlist")).max(5000),
});
export type InterviewInput = z.infer<typeof InterviewInput>;

export async function generateQuestionsAction(
  form: FormData,
): Promise<Result<{ questions: string[]; description: string }>> {
  try {
    await requireUser();
    const input = z
      .object({
        name: z.string().trim().min(1, "Add a name first").max(120),
        objective: z.string().trim().min(1, "Add an objective first").max(4000),
        count: z.coerce.number().int().min(1).max(15),
        context: z.string().max(30_000),
      })
      .parse({
        name: form.get("name"),
        objective: form.get("objective"),
        count: form.get("count"),
        context: form.get("context") ?? "",
      });
    let context = input.context;
    let pdf: { base64: string } | undefined;
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) throw new Error("File is too large (max 8 MB)");
      if (file.type === "application/pdf") {
        pdf = { base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
      } else {
        context = `${(await file.text()).slice(0, 30_000)}\n${context}`;
      }
    }
    return { ok: true, ...(await generateQuestions({ ...input, context, pdf })) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveInterviewAction(
  id: string | null,
  raw: InterviewInput,
): Promise<Result<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = InterviewInput.parse(raw);
    await getUsableInterviewer(data.interviewerId, user.id);
    const values = { ...data, logoUrl: data.logoUrl || null };
    if (id) {
      await getOwnedInterview(id, user.id);
      await db.update(interview).set(values).where(eq(interview.id, id));
      revalidatePath(`/dashboard/interviews/${id}`);
      return { ok: true, id };
    }
    const newId = nanoid(12);
    await db.insert(interview).values({ ...values, id: newId, ownerId: user.id });
    revalidatePath("/dashboard");
    return { ok: true, id: newId };
  } catch (e) {
    return fail(e);
  }
}

export async function setInterviewActiveAction(id: string, isActive: boolean): Promise<Result> {
  try {
    const user = await requireUser();
    await getOwnedInterview(id, user.id);
    await db.update(interview).set({ isActive }).where(eq(interview.id, id));
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInterviewAction(id: string): Promise<Result> {
  try {
    const user = await requireUser();
    await getOwnedInterview(id, user.id);
    await db.delete(interview).where(eq(interview.id, id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function refreshInsightsAction(id: string): Promise<Result> {
  try {
    const user = await requireUser();
    await getOwnedInterview(id, user.id);
    await refreshInsights(id);
    revalidatePath(`/dashboard/interviews/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- responses ----------

export async function setCandidateStatusAction(
  responseId: string,
  status: "none" | "shortlisted" | "maybe" | "rejected",
): Promise<Result> {
  try {
    const user = await requireUser();
    const parsed = z.enum(["none", "shortlisted", "maybe", "rejected"]).parse(status);
    const { interview: iv } = await getOwnedResponse(responseId, user.id);
    await db.update(response).set({ candidateStatus: parsed }).where(eq(response.id, responseId));
    revalidatePath(`/dashboard/interviews/${iv.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteResponseAction(responseId: string): Promise<Result> {
  try {
    const user = await requireUser();
    const { interview: iv } = await getOwnedResponse(responseId, user.id);
    await db.delete(response).where(eq(response.id, responseId));
    revalidatePath(`/dashboard/interviews/${iv.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reanalyzeAction(responseId: string): Promise<Result> {
  try {
    const user = await requireUser();
    const { interview: iv } = await getOwnedResponse(responseId, user.id);
    await db.update(response).set({ analysisStatus: "running", analysisStartedAt: new Date() }).where(eq(response.id, responseId));
    after(() => runAnalysis(responseId));
    revalidatePath(`/dashboard/interviews/${iv.id}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- interviewers ----------

const InterviewerInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  description: z.string().trim().min(1, "Add a short description").max(500),
  voice: z.enum(VOICES.map((v) => v.id) as [string, ...string[]]),
  color: z.enum(AVATAR_COLORS as [string, ...string[]]),
  empathy: z.number().int().min(1).max(10),
  exploration: z.number().int().min(1).max(10),
  rapport: z.number().int().min(1).max(10),
  speed: z.number().int().min(1).max(10),
});
export type InterviewerInput = z.infer<typeof InterviewerInput>;

export async function saveInterviewerAction(
  id: string | null,
  raw: InterviewerInput,
): Promise<Result<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = InterviewerInput.parse(raw);
    if (id) {
      const res = await db
        .update(interviewer)
        .set(data)
        .where(and(eq(interviewer.id, id), eq(interviewer.ownerId, user.id)))
        .returning({ id: interviewer.id });
      if (!res.length) throw new Error("Built-in interviewers can't be edited — duplicate it instead");
      revalidatePath("/dashboard/interviewers");
      return { ok: true, id };
    }
    const newId = nanoid(12);
    await db.insert(interviewer).values({ ...data, id: newId, ownerId: user.id });
    revalidatePath("/dashboard/interviewers");
    return { ok: true, id: newId };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInterviewerAction(id: string): Promise<Result> {
  try {
    const user = await requireUser();
    const inUse = await db
      .select({ id: interview.id })
      .from(interview)
      .where(eq(interview.interviewerId, id))
      .limit(1);
    if (inUse.length) throw new Error("This interviewer is used by an interview. Reassign it first.");
    const res = await db
      .delete(interviewer)
      .where(and(eq(interviewer.id, id), eq(interviewer.ownerId, user.id)))
      .returning({ id: interviewer.id });
    if (!res.length) throw new Error("Built-in interviewers can't be deleted");
    revalidatePath("/dashboard/interviewers");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
