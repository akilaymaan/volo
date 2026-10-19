import "server-only";
import { and, eq, gte, ilike, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interview, response } from "@/lib/db/schema";
import { dashboardMonths, parseDashboardFilters } from "@/lib/dashboard-filters";

/** Read-only aggregate projection: no transcripts, candidate identity, audio or credentials. */
export async function dashboardAnalytics(ownerId: string, raw: unknown) {
  const filters = parseDashboardFilters(raw);
  const literalQuery = filters.q.replace(/[\\%_]/g, "\\$&");
  const scope = and(eq(interview.ownerId, ownerId),
    filters.q ? ilike(interview.name, `%${literalQuery}%`) : undefined,
    filters.status !== "all" ? eq(interview.isActive, filters.status === "live") : undefined,
    gte(response.createdAt, new Date(`${filters.from}T00:00:00Z`)),
    lt(response.createdAt, new Date(Date.parse(`${filters.to}T00:00:00Z`) + 86_400_000)));
  const [totals] = await db.select({
    started: sql<number>`count(*)::int`,
    completed: sql<number>`count(*) filter (where ${response.status} = 'completed')::int`,
    avgDuration: sql<number | null>`round(avg(${response.durationSec}) filter (where ${response.status} = 'completed'))::int`,
    avgScore: sql<number | null>`round(avg((${response.analytics}->>'overallScore')::numeric) filter (where ${response.status} = 'completed' and ${response.analysisStatus} = 'done'))::int`,
    none: sql<number>`count(*) filter (where ${response.status} = 'completed' and ${response.candidateStatus} = 'none')::int`,
    shortlisted: sql<number>`count(*) filter (where ${response.status} = 'completed' and ${response.candidateStatus} = 'shortlisted')::int`,
    maybe: sql<number>`count(*) filter (where ${response.status} = 'completed' and ${response.candidateStatus} = 'maybe')::int`,
    rejected: sql<number>`count(*) filter (where ${response.status} = 'completed' and ${response.candidateStatus} = 'rejected')::int`,
  }).from(response).innerJoin(interview, eq(response.interviewId, interview.id)).where(scope);
  const month = sql<string>`to_char(${response.createdAt} at time zone 'UTC', 'YYYY-MM')`;
  const rows = await db.select({ month, count: sql<number>`count(*)::int` }).from(response)
    .innerJoin(interview, eq(response.interviewId, interview.id))
    .where(and(scope, eq(response.status, "completed"))).groupBy(month);
  const counts = new Map(rows.map((row) => [row.month, row.count]));
  return { filters, totals, months: dashboardMonths(filters.from, filters.to).map((month) => ({ month, count: counts.get(month) ?? 0 })) };
}
