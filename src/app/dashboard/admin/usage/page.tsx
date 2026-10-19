import { adminUsage } from "@/lib/admin-usage";

export const metadata = { title: "API usage · Admin" };

export default async function UsagePage() {
  const { total, recent } = await adminUsage();
  return <>
    <h1 className="text-3xl font-bold">API usage</h1>
    <p className="mt-2 text-muted-foreground">Admin only · All-time recorded provider activity across all accounts.</p>
    <div className="my-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-5"><p>Successful provider calls</p><strong className="text-2xl">{total.calls}</strong></div>
      <div className="rounded-xl border bg-card p-5"><p>Estimated priced usage (USD)</p><strong className="text-2xl">${(total.microusd / 1_000_000).toFixed(4)}</strong></div>
      <div className="rounded-xl border bg-card p-5"><p>Unpriced calls</p><strong className="text-2xl">{total.calls - total.priced}</strong></div>
    </div>
    <p className="text-sm text-muted-foreground">Estimates are not invoices. Configure per-model rates to price tokens and TTS characters. STT bytes are measured, but duration-based STT costs remain unpriced. Provider failures, automatic SDK retries and fallback billing may not appear. Ledger write failures are logged; these totals are not suitable for enforcing hard spending limits.</p>
    <h2 className="mb-3 mt-8 text-xl font-semibold">Recent usage</h2>
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-left text-sm">
        <thead><tr>{["Date", "Account", "Operation", "Model", "Measured units", "Estimated USD"].map((t) => <th key={t} className="p-3">{t}</th>)}</tr></thead>
        <tbody>{recent.map((r) => <tr key={r.id} className="border-t">
          <td className="p-3">{r.createdAt.toLocaleString()}</td><td className="p-3">{r.accountId ?? "Deleted account"}</td><td className="p-3">{r.operation}</td><td className="p-3">{r.model}</td>
          <td className="p-3">{Object.entries(r.units).map(([k, v]) => `${k}: ${v}`).join(", ")}</td>
          <td className="p-3">{r.estimatedCostMicrousd === null ? "Unpriced" : (r.estimatedCostMicrousd / 1_000_000).toFixed(6)}</td>
        </tr>)}</tbody>
      </table>
      {!recent.length && <p className="p-4 text-muted-foreground">No recorded provider usage yet.</p>}
    </div>
  </>;
}
