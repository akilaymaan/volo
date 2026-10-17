import { desc, eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { usageEvent } from "@/lib/db/schema";
import { expireAccountData } from "@/lib/retention";
import { RetentionControls } from "@/components/retention-controls";

export const metadata = { title: "Usage and privacy" };

export default async function UsagePage() {
  const user = await requireUser();
  const [total] = await db.select({
    calls: sql<number>`count(*)::int`,
    priced: sql<number>`count(${usageEvent.estimatedCostMicrousd})::int`,
    microusd: sql<number>`coalesce(sum(${usageEvent.estimatedCostMicrousd}), 0)::float`,
  }).from(usageEvent).where(eq(usageEvent.accountId, user.id));
  const recent = await db.select().from(usageEvent).where(eq(usageEvent.accountId, user.id))
    .orderBy(desc(usageEvent.createdAt)).limit(100);
  const due = await expireAccountData(user.id);
  return <>
    <h1 className="text-3xl font-bold">Usage and privacy</h1>
    <p className="mt-2 text-muted-foreground">All-time account activity. Mock AI calls are not billed or recorded.</p>
    <div className="my-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-5"><p>Successful provider calls</p><strong className="text-2xl">{total.calls}</strong></div>
      <div className="rounded-xl border bg-card p-5"><p>Estimated priced usage (USD)</p><strong className="text-2xl">${(total.microusd / 1_000_000).toFixed(4)}</strong></div>
      <div className="rounded-xl border bg-card p-5"><p>Unpriced calls</p><strong className="text-2xl">{total.calls - total.priced}</strong></div>
    </div>
    <p className="text-sm text-muted-foreground">Estimates are not invoices. Configure per-model rates to price tokens and TTS characters. STT bytes are measured, but duration-based STT costs remain unpriced. Provider failures, automatic SDK retries and fallback billing may not appear. Ledger write failures are logged; these totals are not suitable for enforcing hard spending limits.</p>
    <section className="my-8 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Expired candidate data</h2>
      <p className="my-3 text-sm">{due.responses} response(s) and {due.invitations} expired invitation(s) are eligible for cleanup. Legacy responses without a retention date are not automatically deleted. Individual reports and interviews can also be deleted from their action menus.</p>
      <RetentionControls />
    </section>
    <h2 className="mb-3 text-xl font-semibold">Recent usage</h2>
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead><tr>{["Date", "Operation", "Model", "Measured units", "Estimated USD"].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{recent.map((r) => <tr key={r.id} className="border-t">
          <td className="p-3">{r.createdAt.toLocaleString()}</td><td className="p-3">{r.operation}</td><td className="p-3">{r.model}</td>
          <td className="p-3">{Object.entries(r.units).map(([k, v]) => `${k}: ${v}`).join(", ")}</td>
          <td className="p-3">{r.estimatedCostMicrousd === null ? "Unpriced" : (r.estimatedCostMicrousd / 1_000_000).toFixed(6)}</td>
        </tr>)}</tbody>
      </table>
      {!recent.length && <p className="p-4 text-muted-foreground">No recorded provider usage yet.</p>}
    </div>
  </>;
}
