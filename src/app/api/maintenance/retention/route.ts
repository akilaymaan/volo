import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimit, user } from "@/lib/db/schema";
import { expireAccountData } from "@/lib/retention";
import { tokenHash } from "@/lib/security";
import { json } from "@/lib/call";

export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = process.env.RETENTION_CRON_SECRET;
  if (!secret || secret.length < 32) return json({ error: "Maintenance is not configured" }, 503);
  const supplied = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(Buffer.from(tokenHash(supplied)), Buffer.from(tokenHash(`Bearer ${secret}`))))
    return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.dryRun !== "boolean") return json({ error: "Specify dryRun: true or false" }, 400);
  if (!body.dryRun && process.env.RETENTION_ENABLED !== "1")
    return json({ error: "Automatic deletion is disabled" }, 403);
  const result = { responses: 0, invitations: 0, applied: !body.dryRun };
  try {
    const owners = await db.select({ id: user.id }).from(user);
    for (const owner of owners) {
      const deleted = await expireAccountData(owner.id, !body.dryRun);
      result.responses += deleted.responses;
      result.invitations += deleted.invitations;
    }
    if (!body.dryRun) await db.delete(rateLimit).where(lt(rateLimit.windowStart, new Date(Date.now() - 86_400_000)));
    console.info("[retention] maintenance finished", result);
    return json(result);
  } catch {
    console.error("[retention] maintenance failed");
    return json({ error: "Maintenance failed; retry safely" }, 503);
  }
}
