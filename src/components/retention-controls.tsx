"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { expireAccountDataAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function RetentionControls() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button variant="destructive" disabled={pending} onClick={() => {
    if (!window.confirm("Permanently delete your expired candidate records, recordings, reports and invitations? This cannot be undone.")) return;
    start(async () => {
      const result = await expireAccountDataAction();
      if (!result.ok) toast.error(result.error);
      else { toast.success("Expired candidate data deleted"); router.refresh(); }
    });
  }}>Delete expired data</Button>;
}
