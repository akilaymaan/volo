"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewInvitationImportAction, sendImportedInvitationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_IMPORT_BYTES, type ImportMode, type ImportRecipient } from "@/lib/invitation-import";

type Outcome = { status: "accepted" | "failed" | "unknown"; message: string };
const STATUS_LABEL = { ready: "Ready", invalid: "Invalid", duplicate: "Duplicate", blocked: "Skipped", accepted: "Accepted", failed: "Failed", unknown: "Unconfirmed" };

export function BulkInvitationImport({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("new");
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ImportRecipient[]>([]);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState("");
  const [pending, start] = useTransition();
  const cancelled = useRef(false);
  const busy = useRef(false);
  const fileVersion = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelled.current = true; };
  }, []);

  const ready = rows.filter((r) => r.status === "ready" && !outcomes[r.row]);
  const resetPreview = () => { setRows([]); setOutcomes({}); setConfirmed(false); setSummary(""); setError(""); };

  async function readFile(file: File | undefined) {
    const version = ++fileVersion.current;
    resetPreview();
    setCsv("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setError("CSV must be under 100 KB."); return; }
    try {
      const text = await file.text();
      if (mounted.current && version === fileVersion.current) setCsv(text);
    } catch { if (mounted.current && version === fileVersion.current) setError("Couldn't read this file. Choose it again."); }
  }

  function preview() {
    if (busy.current) return;
    resetPreview();
    busy.current = true;
    start(async () => {
      try {
        const result = await previewInvitationImportAction(interviewId, csv, mode);
        if (!mounted.current) return;
        if (result.ok) setRows(result.rows);
        else setError(result.error);
      } catch { if (mounted.current) setError("Couldn't load the preview. Refresh the page and try again."); }
      finally { busy.current = false; }
    });
  }

  function send() {
    if (busy.current || !confirmed || !ready.length) return;
    busy.current = true;
    cancelled.current = false;
    setSending(true);
    setError("");
    setSummary("");
    const recipients = [...ready];
    start(async () => {
      let accepted = 0;
      let failed = 0;
      let attempted = 0;
      try {
        for (const recipient of recipients) {
          if (cancelled.current) break;
          attempted++;
          let outcome: Outcome;
          try {
            const result = await sendImportedInvitationAction(interviewId, recipient.email, mode);
            outcome = result.ok ? { status: "accepted", message: "Accepted by email provider" }
              : { status: "failed", message: result.error };
            if (result.ok) accepted++; else failed++;
          } catch {
            // Never automatically retry an ambiguous send: it may already have reached the provider.
            outcome = { status: "unknown", message: "Send not confirmed. Refresh the preview and review the invitation list before retrying." };
            failed++;
            cancelled.current = true;
          }
          if (mounted.current) setOutcomes((previous) => ({ ...previous, [recipient.row]: outcome }));
        }
      } finally {
        busy.current = false;
        if (mounted.current) {
          setSending(false);
          setConfirmed(false);
          setSummary(`${accepted} accepted by email provider, ${failed} failed or unconfirmed, ${recipients.length - attempted} not attempted.`);
          router.refresh();
        }
      }
    });
  }

  return (
    <section aria-labelledby="bulk-invitations-heading" className="mt-6 min-w-0 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="bulk-invitations-heading" className="font-semibold">Bulk invitations and reminders</h3>
          <p className="mt-1 text-sm text-muted-foreground">Upload up to 100 recipients with an email column and an optional name column. Review the preview before sending.</p>
        </div>
        <a download="invitation-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("name,email\n")}`} className="text-sm underline underline-offset-4">Download CSV template</a>
      </div>
      <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 sm:w-44">
          <Label htmlFor="import-mode">Send type</Label>
          <select id="import-mode" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={mode} disabled={pending} onChange={(event) => {
            setMode(event.target.value as ImportMode);
            resetPreview();
          }}>
            <option value="new">New invitations</option>
            <option value="reminder">Reminders</option>
          </select>
        </div>
        <div className="min-w-0 space-y-1.5 sm:min-w-48 sm:flex-1">
          <Label htmlFor="invitation-csv">Recipient CSV</Label>
          <Input id="invitation-csv" type="file" accept=".csv,text/csv" disabled={pending} onChange={(event) => void readFile(event.target.files?.[0])} />
        </div>
        <Button type="button" variant="outline" disabled={pending || !csv} onClick={preview}>Preview CSV</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {mode === "new" ? "Existing invitations, duplicate addresses and candidates who already started are skipped. Names help you review the file; candidates enter their own details when starting."
          : "Reminders are sent only when you trigger them, after a 24-hour wait, for unexpired invitations that have not started. Maximum 3 total send attempts. Each reminder replaces the old link."}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {rows.length > 0 && (
        <>
          <p className="mt-4 text-sm font-medium">{ready.length} ready to send · {rows.filter((r) => r.status !== "ready").length} skipped</p>
          <div className="mt-3 max-h-80 overflow-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-left text-sm" aria-label="CSV recipient preview">
              <thead><tr className="border-b bg-muted"><th className="p-2">Line</th><th className="p-2">Recipient</th><th className="p-2">Status</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.row} className="border-b last:border-b-0">
                  <td className="p-2 align-top">{r.row}</td>
                  <td className="min-w-40 max-w-64 break-all p-2 align-top">{r.name && <span className="block font-medium">{r.name}</span>}{r.email || "(missing email)"}</td>
                  <td className="min-w-40 p-2 align-top">
                    <span className="font-medium">{STATUS_LABEL[outcomes[r.row]?.status ?? r.status]}</span>
                    <p className="text-xs text-muted-foreground">{outcomes[r.row]?.message ?? r.reason}</p>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {ready.length > 0 && <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4" />
            I reviewed these recipients and want to send {mode === "new" ? "invitations" : "reminders"}.
          </label>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" disabled={pending || !confirmed || !ready.length} onClick={send}>
              {sending ? "Sending…" : `Send ${ready.length} ${mode === "new" ? "invitations" : "reminders"}`}
            </Button>
            {sending && <Button type="button" variant="outline" onClick={() => { cancelled.current = true; }}>Stop after current send</Button>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Keep this tab open while sending. Closing or leaving it stops remaining sends; an in-flight email may still be sent. The account limit is 100 send attempts per hour.</p>
        </>
      )}
      <p role="status" className="mt-3 text-sm">{summary}</p>
    </section>
  );
}
