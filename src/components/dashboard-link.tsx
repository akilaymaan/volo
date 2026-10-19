"use client";

import Link, { useLinkStatus } from "next/link";
import { type ComponentProps } from "react";
import { canPrefetchDashboard } from "@/lib/dashboard-navigation";

function NavigationFeedback() {
  const { pending } = useLinkStatus();
  return <span className="navigation-feedback" data-pending={pending || undefined} aria-hidden="true" />;
}

/** Fully preloads visible read-only destinations, before the user starts a click. */
export function DashboardLink({ children, prefetch, ...props }: ComponentProps<typeof Link>) {
  const safe = canPrefetchDashboard(props.href) && prefetch !== false;
  return <Link {...props} data-dashboard-link="" prefetch={safe}>
    {children}<NavigationFeedback />
  </Link>;
}
