import { z } from "zod";
import { PublicError } from "@/lib/errors";

export const INBOX_PAGE_SIZE = 25;
export const INBOX_MAX_PAGE = 1000;
export const INBOX_CATEGORIES = {
  attention: "All attention items", unopened: "Unopened reports", decision: "Needs decision",
  failed: "Analysis failed", recording: "Without recording",
} as const;

const date = z.string().default("").refine((value) => {
  if (!value) return true;
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
});
const Filters = z.object({
  category: z.enum(["attention", "unopened", "decision", "failed", "recording"]).default("attention"),
  interviewId: z.string().max(64).regex(/^[\w-]*$/).default(""),
  candidateStatus: z.enum(["all", "none", "shortlisted", "maybe", "rejected"]).default("all"),
  from: date, to: date,
  page: z.preprocess((value) => typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : value,
    z.number().int().min(1).max(INBOX_MAX_PAGE).default(1)),
}).refine((value) => !value.from || !value.to || value.from <= value.to);
export type InboxFilters = z.infer<typeof Filters>;

export function parseInboxFilters(raw: unknown): InboxFilters {
  const parsed = Filters.safeParse(raw);
  if (!parsed.success) throw new PublicError("Invalid inbox filters. Use valid dates (from no later than through), interview/status options and a page between 1 and 1000.");
  return parsed.data;
}

export function inboxHref(filters: InboxFilters, patch: Partial<InboxFilters> = {}) {
  const values = { ...filters, ...patch };
  const query = new URLSearchParams();
  if (values.category !== "attention") query.set("category", values.category);
  if (values.interviewId) query.set("interviewId", values.interviewId);
  if (values.candidateStatus !== "all") query.set("candidateStatus", values.candidateStatus);
  if (values.from) query.set("from", values.from);
  if (values.to) query.set("to", values.to);
  if (values.page > 1) query.set("page", String(values.page));
  return `/dashboard/inbox${query.size ? `?${query}` : ""}`;
}
