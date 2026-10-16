import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { getOwnedResponse } from "@/lib/data";
import { db } from "@/lib/db";
import { recording } from "@/lib/db/schema";

export async function GET(_req: Request, ctx: RouteContext<"/api/recordings/[id]">) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  await getOwnedResponse(id, user.id);
  const [rec] = await db.select().from(recording).where(eq(recording.responseId, id));
  if (!rec) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rec.data), {
    headers: {
      "content-type": rec.mime,
      "content-length": String(rec.data.length),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
