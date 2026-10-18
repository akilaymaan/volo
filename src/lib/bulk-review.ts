import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { MAX_BULK_REVIEW } from "@/lib/constants";
import { db } from "@/lib/db";
import { interview, response } from "@/lib/db/schema";
import { PublicError } from "@/lib/errors";

const statusSchema = z.enum(["none", "shortlisted", "maybe", "rejected"]);
const inputSchema = z.object({
  interviewId: z.string().min(1).max(64),
  candidates: z.array(z.object({ id: z.string().min(1).max(64), status: statusSchema }))
    .min(1, "Select at least one candidate.").max(MAX_BULK_REVIEW)
    .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, "Candidate selections must be unique."),
  status: statusSchema,
});

/** All-or-nothing manual review. Expected statuses protect against stale browser selections. */
export async function bulkReviewCandidates(ownerId: string, raw: unknown) {
  const input = inputSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [owned] = await tx.select({ id: interview.id }).from(interview)
      .where(and(eq(interview.id, input.interviewId), eq(interview.ownerId, ownerId))).for("update");
    if (!owned) throw new PublicError("Interview not found or unavailable.");
    const ids = input.candidates.map((r) => r.id);
    const rows = await tx.select({ id: response.id, candidateStatus: response.candidateStatus }).from(response)
      .where(and(eq(response.interviewId, owned.id), eq(response.status, "completed"), inArray(response.id, ids)))
      .orderBy(asc(response.id)).for("update");
    if (rows.length !== ids.length) throw new PublicError("Some candidates are no longer available. Refresh and select them again. No statuses were changed.");
    const expected = new Map(input.candidates.map((r) => [r.id, r.status]));
    if (rows.some((r) => expected.get(r.id) !== r.candidateStatus))
      throw new PublicError("Candidate statuses changed since selection. Refresh and select them again. No statuses were changed.");
    await tx.update(response).set({ candidateStatus: input.status })
      .where(and(eq(response.interviewId, owned.id), inArray(response.id, ids)));
    return { count: rows.length, interviewId: owned.id };
  });
}
