import { z } from "zod";
import { PublicError } from "@/lib/errors";

const date = z.string().refine((value) => /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);

const interviewFields = {
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "live", "paused"]).default("all"),
};

export function parseInterviewFilters(raw: unknown) {
  const result = z.object(interviewFields).safeParse(raw);
  if (!result.success) throw new PublicError("Invalid interview filters. Use a name of up to 100 characters and a valid interview status.");
  return result.data;
}

export function parseDashboardFilters(raw: unknown, now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const schema = z.object({
    from: date.default(from), to: date.default(now.toISOString().slice(0, 10)),
    ...interviewFields,
  }).refine((v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86_400_000);
  const result = schema.safeParse(raw);
  if (!result.success) throw new PublicError("Invalid dashboard filters. Choose valid dates in order, no more than 367 days apart, and a valid interview status.");
  return result.data;
}

export type DashboardFilters = ReturnType<typeof parseDashboardFilters>;

export function dashboardMonths(from: string, to: string) {
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = to.slice(0, 7);
  const months: string[] = [];
  while (cursor.toISOString().slice(0, 7) <= end && months.length < 14) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
