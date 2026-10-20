import { Suspense } from "react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import DashboardLoading from "@/components/dashboard-loading";
import { DashboardChart } from "@/components/dashboard-chart";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { requireUser } from "@/lib/auth";
import { dashboardAnalytics } from "@/lib/dashboard-data";
import { parseDashboardFilters, type DashboardFilters as Filters } from "@/lib/dashboard-filters";
import { listInterviews } from "@/lib/data";
import { PublicError } from "@/lib/errors";
import styles from "@/components/dashboard-overview.module.css";

export const metadata = { title: "Analytics" };

export default async function Analytics({ searchParams }: PageProps<"/dashboard/analytics">) {
  const user = await requireUser();
  let filters;
  try { filters = parseDashboardFilters(await searchParams); }
  catch (error) { return <div role="alert" className={styles.invalid}><p>{error instanceof PublicError ? error.message : "Could not read analytics filters."}</p><Link href="/dashboard/analytics">Reset analytics filters</Link></div>; }
  return <Suspense key={JSON.stringify(filters)} fallback={<DashboardLoading />}><AnalyticsContent ownerId={user.id} filters={filters} /></Suspense>;
}

async function AnalyticsContent({ ownerId, filters }: { ownerId: string; filters: Filters }) {
  const [allInterviews, analytics] = await Promise.all([listInterviews(ownerId), dashboardAnalytics(ownerId, filters)]);
  const active = allInterviews.filter((iv) => iv.isActive && iv.name.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase()) && filters.status !== "paused").length;
  return <>
    <p className="mb-5 text-sm text-muted-foreground">Explore interview activity and review trends. Your day-to-day work stays in <Link href="/dashboard" className="underline underline-offset-4">Interviews</Link>.</p>
    <DashboardFilters filters={filters} />
    <DashboardChart months={analytics.months} />
    <DashboardMetrics totals={analytics.totals} active={active} />
  </>;
}
