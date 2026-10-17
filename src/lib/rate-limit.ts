import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/db/schema";
import { tokenHash } from "@/lib/security";

/** A database-backed fixed window shared by all app instances. Keys contain no PII. */
export async function takeRateLimit(key: string, limit: number, windowMs = 600_000) {
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await db.insert(rateLimit).values({ key: tokenHash(key), windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        windowStart: start,
        count: sql`case when ${rateLimit.windowStart} = ${start.toISOString()} then ${rateLimit.count} + 1 else 1 end`,
      },
    }).returning({ count: rateLimit.count });
  return row.count <= limit;
}
