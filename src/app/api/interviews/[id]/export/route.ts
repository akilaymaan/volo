import { getUser } from "@/lib/auth";
import { CANDIDATE_STATUSES, RECOMMENDATIONS } from "@/lib/constants";
import { toCsv } from "@/lib/csv";
import { getOwnedInterview, listResponses } from "@/lib/data";

export async function GET(req: Request, ctx: RouteContext<"/api/interviews/[id]/export">) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const iv = await getOwnedInterview(id, user.id);
  const origin = new URL(req.url).origin;
  const rows = (await listResponses(id)).map((r) => [
    r.name || "Anonymous",
    r.email,
    r.createdAt.toISOString(),
    Math.round(r.durationSec / 6) / 10,
    r.analytics?.overallScore,
    r.analytics ? RECOMMENDATIONS[r.analytics.recommendation].label : "",
    r.analytics?.communication.score,
    CANDIDATE_STATUSES[r.candidateStatus].label,
    r.tabSwitchCount,
    r.analytics?.callSummary,
    `${origin}/dashboard/interviews/${id}/responses/${r.id}`,
  ]);
  const csv = toCsv([
    ["Name", "Email", "Date", "Duration (min)", "Score", "Recommendation", "Communication", "Status", "Tab switches", "Summary", "Report"],
    ...rows,
  ]);
  const filename = `${iv.name.replace(/[^\w-]+/g, "-").slice(0, 60) || "interview"}-responses.csv`;
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
