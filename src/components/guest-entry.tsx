"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GuestEntry() {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    if (locked.current) return;
    locked.current = true;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/guest-entry", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many new workspaces. Please try again later." : "Could not open your workspace. Please try again.");
      router.replace("/dashboard"); router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect. Please try again.");
      locked.current = false; setPending(false);
    }
  }
  return <div className="space-y-4">
    <Button type="button" onClick={() => void enter()} disabled={pending} aria-busy={pending}
      className="group h-14 w-full justify-between rounded-xl px-5 text-base">
      <span>{pending ? "Opening your workspace…" : "Enter Volo"}</span>
      {pending ? <Loader2Icon className="size-5 animate-spin" /> : <ArrowRightIcon className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />}
    </Button>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">Your guest workspace stays with this browser session. Signing out, clearing cookies or session expiry means you can&apos;t return to it. Don&apos;t use it for sensitive candidate data.</p>
  </div>;
}
