import "server-only";
import { desc, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { usageEvent } from "@/lib/db/schema";

/** Authorize before any cross-account query. Do not cache globally. */
export async function adminUsage() {
  await requireAdmin();
  const [[total], recent] = await Promise.all([
    db.select({
      calls: sql<number>`count(*)::int`,
      priced: sql<number>`count(${usageEvent.estimatedCostMicrousd})::int`,
      microusd: sql<number>`coalesce(sum(${usageEvent.estimatedCostMicrousd}), 0)::float`,
    }).from(usageEvent),
    db.select({
      id: usageEvent.id, accountId: usageEvent.accountId, createdAt: usageEvent.createdAt,
      operation: usageEvent.operation, model: usageEvent.model, units: usageEvent.units,
      estimatedCostMicrousd: usageEvent.estimatedCostMicrousd,
    }).from(usageEvent).orderBy(desc(usageEvent.createdAt), desc(usageEvent.id)).limit(100),
  ]);
  return { total, recent };
}
