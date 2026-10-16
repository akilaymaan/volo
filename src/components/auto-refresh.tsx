"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data every few seconds while `when` is true (e.g. analyses in progress). */
export function AutoRefresh({ when, ms = 5000 }: { when: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!when) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [when, ms, router]);
  return null;
}
