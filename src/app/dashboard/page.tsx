import { PlusIcon } from "lucide-react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { Suspense } from "react";
import DashboardLoading from "@/components/dashboard-loading";
import { CopyButton } from "@/components/copy-button";
import { ScoreBadge } from "@/components/score";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonaDot } from "@/components/voice-orb";
import { DashboardChart } from "@/components/dashboard-chart";
import { DashboardFilters } from "@/components/dashboard-filters";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import { dashboardAnalytics } from "@/lib/dashboard-data";
import { parseDashboardFilters, type DashboardFilters as Filters } from "@/lib/dashboard-filters";
import { PublicError } from "@/lib/errors";
import styles from "@/components/dashboard-overview.module.css";
import { requireUser } from "@/lib/auth";
import { languageLabel } from "@/lib/constants";
import { listInterviews } from "@/lib/data";

export const metadata = { title: "Interviews" };

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  let filters;
  try { filters = parseDashboardFilters(await searchParams); }
  catch (error) { return <div role="alert" className={styles.invalid}><p>{error instanceof PublicError ? error.message : "Could not read dashboard filters."}</p><Link href="/dashboard">Reset dashboard filters</Link></div>; }
  return <Suspense key={JSON.stringify(filters)} fallback={<DashboardLoading />}><DashboardContent ownerId={user.id} filters={filters} /></Suspense>;
}

async function DashboardContent({ ownerId, filters }: { ownerId: string; filters: Filters }) {
  const [allInterviews, analytics] = await Promise.all([listInterviews(ownerId), dashboardAnalytics(ownerId, filters)]);
  const interviews = allInterviews.filter((iv) => iv.name.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())
    && (filters.status === "all" || iv.isActive === (filters.status === "live")));

  return (
    <>
      <DashboardFilters filters={filters} />
      <DashboardChart months={analytics.months} />
      <DashboardMetrics totals={analytics.totals} active={interviews.filter((iv) => iv.isActive).length} />
      <section id="interviews" className={styles.interviews} aria-label="Your interviews">
      <div className={styles.listHeader}>
        <div>
          <h2>Your interviews</h2>
          <p>
            Share a link, and every finished conversation shows up here with a score. Response totals below are all-time.
          </p>
        </div>
        <Link href="/dashboard/inbox" prefetch={false}>Review inbox</Link>
      </div>

      {interviews.length === 0 ? (
        <div className={styles.empty}>
          <h2>{allInterviews.length ? "No interviews match your filters" : "Create your first interview"}</h2>
          <p>
            {allInterviews.length ? "Try another interview name or status. Your existing interviews have not changed." : <>
            Paste a job description and Volo drafts the questions. You&apos;ll get a link to send
            to candidates in about two minutes.
            </>}
          </p>
          <Button asChild className="mt-6 h-10">
            <Link href="/dashboard/interviews/new">
              <PlusIcon /> New interview
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {interviews.map((iv) => (
            <li key={iv.id} className={`${styles.interviewRow} relative flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:px-5`}>
              <PersonaDot color={iv.interviewerColor} name={iv.interviewerName} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/interviews/${iv.id}`} prefetch={false} data-stretched-link="" className="text-sm font-medium after:absolute after:inset-0">
                  {iv.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {iv.interviewerName}, {languageLabel(iv.language)}, {iv.durationMins} min
                </p>
              </div>
              <div className={`${styles.interviewMeta} flex items-center gap-5`}>
                <div className="text-right">
                  <p className="font-heading text-lg font-semibold leading-none">{iv.responses}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {iv.unviewed > 0 ? <span className="font-medium text-primary">{iv.unviewed} new</span> : "responses"}
                  </p>
                </div>
                <ScoreBadge score={iv.avgScore} label="avg" />
                {iv.isActive ? (
                  <Badge variant="secondary">Live</Badge>
                ) : (
                  <Badge variant="secondary">Paused</Badge>
                )}
                <div className="relative z-10">
                  <CopyButton text={`/i/${iv.id}`} iconOnly variant="ghost" label="Copy interview link" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      </section>
    </>
  );
}
