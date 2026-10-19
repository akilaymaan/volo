"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { retryInboxAnalysisAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function RefreshInboxButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "Refreshing…" : "Refresh inbox"}</Button>;
}

export function InboxRetryButton({ responseId }: { responseId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return <AlertDialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
    <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={pending}>Retry analysis</Button></AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Retry this AI analysis?</AlertDialogTitle>
        <AlertDialogDescription>This requests a new AI analysis and may incur provider charges. Candidate decisions are unchanged. Historical responses without a saved interview snapshot use current interview settings.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <Button disabled={pending} onClick={() => start(async () => {
          try {
            const result = await retryInboxAnalysisAction(responseId);
            if (!result.ok) toast.error(result.error);
            else toast.success("Analysis retry queued");
          } catch { toast.error("Could not confirm the retry. Refresh and check analysis status before trying again."); }
          finally { setOpen(false); router.refresh(); }
        })}>{pending ? "Queueing…" : "Confirm analysis retry"}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
