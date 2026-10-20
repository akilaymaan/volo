import { ArrowRightIcon, MessagesSquareIcon, PlusIcon } from "lucide-react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { Suspense } from "react";
import DashboardLoading from "@/components/dashboard-loading";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonaDot } from "@/components/voice-orb";
import { InterviewListFilters } from "@/components/interview-list-filters";
import { parseInterviewFilters } from "@/lib/dashboard-filters";
import { PublicError } from "@/lib/errors";
import styles from "@/components/dashboard-overview.module.css";
import { requireUser } from "@/lib/auth";
import { languageLabel } from "@/lib/constants";
import { listInterviews } from "@/lib/data";

export const metadata = { title: "Interviews" };

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  let filters;
  try { filters = parseInterviewFilters(await searchParams); }
  catch (error) { return <div role="alert" className={styles.invalid}><p>{error instanceof PublicError ? error.message : "Could not read interview filters."}</p><Link href="/dashboard">Reset interview filters</Link></div>; }
  return <Suspense key={JSON.stringify(filters)} fallback={<DashboardLoading />}><DashboardContent ownerId={user.id} filters={filters} /></Suspense>;
}

async function DashboardContent({ ownerId, filters }: { ownerId: string; filters: ReturnType<typeof parseInterviewFilters> }) {
  const allInterviews = await listInterviews(ownerId);
  const interviews = allInterviews.filter((iv) => iv.name.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())
    && (filters.status === "all" || iv.isActive === (filters.status === "live")));

  return (
    <>
      {allInterviews.length === 0 ? <section aria-label="Getting started" className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center py-10 text-center">
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl border bg-secondary"><MessagesSquareIcon className="size-6" aria-hidden="true" /></span>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Welcome to Volo</p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create your first interview</h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">Describe the role, review your questions, and share a link. We&apos;ll take care of the conversation.</p>
        <Button asChild className="mt-7 h-12 gap-3 px-6"><Link href="/dashboard/interviews/new"><PlusIcon />New interview<ArrowRightIcon /></Link></Button>
        <Link href="/dashboard/templates" className="mt-4 text-xs text-muted-foreground underline underline-offset-4">Or start from a saved template</Link>
      </section> : <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Create interviews, share links, and review responses.</p>
        <Button asChild className="h-10"><Link href="/dashboard/interviews/new"><PlusIcon />New interview</Link></Button>
      </div>
      <InterviewListFilters filters={filters} />
      <section id="interviews" className={styles.interviews} aria-label="Your interviews">
      <div className={styles.listHeader}>
        <div>
          <h2>Your interviews</h2>
          <p>
            Your roles and candidate responses, in one place.
          </p>
        </div>
        <Link href="/dashboard/inbox" prefetch={false}>Review inbox</Link>
      </div>

      {interviews.length === 0 ? (
        <div className={styles.empty}>
          <h2>No interviews match your filters</h2>
          <p>
            Try another interview name or status. Your existing interviews have not changed.
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
              <PersonaDot color={iv.interviewerColor} name={iv.interviewerName} size={36} monochrome />
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
      </>}
    </>
  );
}
