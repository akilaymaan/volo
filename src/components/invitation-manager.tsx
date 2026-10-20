"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { revokeInviteAction, sendInviteAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BulkInvitationImport } from "@/components/bulk-invitation-import";

export type InvitationRow = {
  id: string; email: string; status: string; expiresAt: string; revoked: boolean; sendCount: number;
};

export function InvitationManager({ interviewId, rows, setupError = null }: { interviewId: string; rows: InvitationRow[]; setupError?: string | null }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (address: string) => start(async () => {
    const result = await sendInviteAction(interviewId, address);
    if (!result.ok) toast.error(result.error);
    else { toast.success("Invitation accepted by email provider"); setEmail(""); }
    router.refresh();
  });
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Email invitations</h2>
      <p className="mt-1 text-sm text-muted-foreground">Personal links expire after 7 days. Resending invalidates the old link. Sent means accepted by the email provider, not delivered or opened.</p>
      {setupError && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm">
        <p className="font-medium">Email invitations are not configured</p>
        <p className="mt-1 break-words">{setupError}</p>
        <p className="mt-2 text-muted-foreground">On Vercel, set these under Project Settings → Environment Variables for Production, then redeploy. EMAIL_FROM must use your verified Resend domain, not a personal Gmail address.</p>
      </div>}
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); send(email); }}>
        <div className="min-w-0 flex-1 basis-full space-y-1 sm:basis-0">
          <Label htmlFor="invite-email">Candidate email</Label>
          <Input id="invite-email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button className="w-full sm:w-auto" disabled={pending || !!setupError} type="submit">Send invitation</Button>
      </form>
      <BulkInvitationImport interviewId={interviewId} sendingDisabled={!!setupError} />
      <ul aria-label="Invitations" className="mt-5 divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="break-all font-medium">{r.email}</p>
              <p className="text-muted-foreground">{r.revoked ? "revoked" : r.status} · Expires {new Date(r.expiresAt).toLocaleDateString()} · {r.sendCount} send attempt(s)</p>
            </div>
            <div className="flex gap-2">
              {!["started", "completed"].includes(r.status) && <Button variant="outline" size="sm" disabled={pending || !!setupError} onClick={() => send(r.email)}>Resend</Button>}
              {!r.revoked && <Button variant="outline" size="sm" disabled={pending} onClick={() => {
                if (!window.confirm("Revoke this invitation? Its link and any active session will stop working.")) return;
                start(async () => {
                  const result = await revokeInviteAction(interviewId, r.id);
                  if (!result.ok) toast.error(result.error);
                  else { toast.success("Invitation revoked"); router.refresh(); }
                });
              }}>Revoke</Button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
