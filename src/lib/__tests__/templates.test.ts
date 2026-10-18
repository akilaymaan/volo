import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { reusableInterviewConfig } from "@/lib/interview-config";
import { deleteTemplate, getOwnedTemplate, listTemplates, saveTemplate } from "@/lib/templates";
import { deleteTemplateAction, saveTemplateAction } from "@/app/actions";
import { requireUser } from "@/lib/auth";

vi.mock("@/lib/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/lib/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db, schema, client };
});
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeAll(async () => {
  await db.insert(schema.user).values([
    { id: "owner", name: "Owner", email: "owner@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
  ]);
  await db.insert(schema.interview).values({
    id: "source", ownerId: "owner", interviewerId: "preset-bob", name: "Engineer",
    objective: "Assess React", description: "A friendly screen", language: "hi-IN", durationMins: 15,
    questions: [{ id: "q1", question: "Describe a project", followUps: 2 }],
    allowedEmails: ["private@example.test"], insights: ["Private cohort insight"],
    isActive: false, retentionDays: 30, themeColor: "#0e6e66", logoUrl: "https://example.test/logo.png",
  });
});

afterAll(async () => {
  const { client } = await import("@/lib/db") as unknown as { client: { close(): Promise<void> } };
  await client.close();
});

it("copies only reusable settings and preserves restricted intake without recipient data", async () => {
  const [iv] = await db.select().from(schema.interview).where(eq(schema.interview.id, "source"));
  const config = reusableInterviewConfig(iv);
  expect(config).toMatchObject({ name: "Engineer", language: "hi-IN", durationMins: 15, invitationOnly: true, retentionDays: 30 });
  expect(Object.keys(config).sort()).toEqual([
    "name", "objective", "description", "interviewerId", "language", "durationMins", "questions",
    "isAnonymous", "themeColor", "logoUrl", "invitationOnly", "retentionDays",
  ].sort());
  config.questions[0].question = "New wording";
  expect(iv.questions[0].question).toBe("Describe a project");
  expect(JSON.stringify(config)).not.toContain("private@example.test");
});

it("snapshots templates independently of later source edits and deletion", async () => {
  const id = await saveTemplate("owner", "source", "  React hiring  ");
  await db.update(schema.interview).set({ objective: "Changed later" }).where(eq(schema.interview.id, "source"));
  const template = await getOwnedTemplate(id, "owner");
  expect(template.name).toBe("React hiring");
  expect(template.config.objective).toBe("Assess React");
  expect(template.config.questions[0].followUps).toBe(2);
  expect(template.config.logoUrl).toBe("https://example.test/logo.png");
  expect(template.config.invitationOnly).toBe(true);
});

it("enforces ownership on reads, saving and deletion, including action entry points", async () => {
  const [template] = await listTemplates("owner");
  expect(await listTemplates("other")).toEqual([]);
  await expect(getOwnedTemplate(template.id, "other")).rejects.toThrow();
  await expect(saveTemplate("other", "source", "Stolen")).rejects.toThrow();
  await expect(deleteTemplate("other", template.id)).rejects.toThrow();
  vi.mocked(requireUser).mockResolvedValue({ id: "other" } as Awaited<ReturnType<typeof requireUser>>);
  await expect(saveTemplateAction("source", "Stolen")).rejects.toThrow();
  await expect(deleteTemplateAction(template.id)).rejects.toThrow();
  expect(await getOwnedTemplate(template.id, "owner")).toBeDefined();
});

it("validates template labels and derives action ownership from the session", async () => {
  await expect(saveTemplate("owner", "source", "   ")).rejects.toThrow();
  await expect(saveTemplate("owner", "source", "x".repeat(121))).rejects.toThrow();
  vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as Awaited<ReturnType<typeof requireUser>>);
  const saved = await saveTemplateAction("source", "Session owned");
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error("Expected saved template");
  expect((await getOwnedTemplate(saved.id, "owner")).ownerId).toBe("owner");
  expect(await deleteTemplateAction(saved.id)).toEqual({ ok: true });
  await expect(getOwnedTemplate(saved.id, "owner")).rejects.toThrow();
});

it("keeps templates after deleting the source, and deleting templates leaves interviews intact", async () => {
  const [template] = await listTemplates("owner");
  await db.delete(schema.interview).where(eq(schema.interview.id, "source"));
  expect((await getOwnedTemplate(template.id, "owner")).config.questions).toHaveLength(1);
  await db.insert(schema.interview).values({
    ...template.config, id: "created-from-template", ownerId: "owner", allowedEmails: [],
  });
  await deleteTemplate("owner", template.id);
  expect(await listTemplates("owner")).toEqual([]);
  expect(await db.select().from(schema.interview).where(eq(schema.interview.id, "created-from-template"))).toHaveLength(1);
});
