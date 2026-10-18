import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { interviewTemplate } from "@/lib/db/schema";
import { getOwnedInterview } from "@/lib/data";
import { reusableInterviewConfig } from "@/lib/interview-config";

export async function listTemplates(ownerId: string) {
  return db.select().from(interviewTemplate)
    .where(eq(interviewTemplate.ownerId, ownerId)).orderBy(desc(interviewTemplate.createdAt), interviewTemplate.id);
}

export async function getOwnedTemplate(id: string, ownerId: string) {
  const [row] = await db.select().from(interviewTemplate)
    .where(and(eq(interviewTemplate.id, id), eq(interviewTemplate.ownerId, ownerId)));
  if (!row) notFound();
  return row;
}

export async function saveTemplate(ownerId: string, interviewId: string, name: string) {
  const label = z.string().trim().min(1, "Give the template a name").max(120).parse(name);
  const iv = await getOwnedInterview(interviewId, ownerId);
  const id = nanoid(12);
  await db.insert(interviewTemplate).values({ id, ownerId, name: label, config: reusableInterviewConfig(iv) });
  return id;
}

export async function deleteTemplate(ownerId: string, id: string) {
  // Scope the mutation itself to the owner; a client-supplied ID is never sufficient.
  const deleted = await db.delete(interviewTemplate)
    .where(and(eq(interviewTemplate.id, id), eq(interviewTemplate.ownerId, ownerId)))
    .returning({ id: interviewTemplate.id });
  if (!deleted.length) notFound();
}
