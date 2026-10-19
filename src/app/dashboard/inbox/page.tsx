import Link from "next/link";
import Form from "next/form";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { InboxRetryButton, RefreshInboxButton } from "@/components/inbox-controls";
import { requireUser } from "@/lib/auth";
import { CANDIDATE_STATUSES } from "@/lib/constants";
import { PublicError } from "@/lib/errors";
import { getReviewInbox, inboxInterviews } from "@/lib/review-inbox";
import { INBOX_CATEGORIES, INBOX_MAX_PAGE, INBOX_PAGE_SIZE, inboxHref, parseInboxFilters } from "@/lib/review-inbox-filters";

export const metadata = { title: "Review inbox" };
export const maxDuration = 300;
const field = "h-9 w-full min-w-0 rounded-lg border bg-background px-2 text-sm";

export default async function ReviewInboxPage(props: PageProps<"/dashboard/inbox">) {
  const user = await requireUser();
  const raw = await props.searchParams;
  let error = "";
  let filters = parseInboxFilters({});
  try { filters = parseInboxFilters(raw); }
  catch (cause) { if (!(cause instanceof PublicError)) throw cause; error = cause.message; }
  const [choices, inbox] = await Promise.all([inboxInterviews(user.id), error ? null : getReviewInbox(user.id, filters)]);
  return <>
    <AutoRefresh when={!!inbox?.counts.processing} />
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Review inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Completed interviews needing attention across your account. Opening a report clears its unopened flag; a candidate still needs a decision until you change their review status.</p>
      </div>
      <RefreshInboxButton />
    </div>
    <Form key={JSON.stringify(filters)} action="/dashboard/inbox" aria-label="Inbox filters" className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
      <div className="min-w-0 space-y-1 text-sm"><label htmlFor="inbox-category">Attention type</label><select id="inbox-category" className={field} name="category" defaultValue={filters.category}>
        {Object.entries(INBOX_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></div>
      <div className="min-w-0 space-y-1 text-sm"><label htmlFor="inbox-interview">Interview</label><select id="inbox-interview" className={field} name="interviewId" defaultValue={filters.interviewId}>
        <option value="">All interviews</option>{choices.map((iv) => <option key={iv.id} value={iv.id}>{iv.name}</option>)}
      </select></div>
      <div className="min-w-0 space-y-1 text-sm"><label htmlFor="inbox-status">Review status</label><select id="inbox-status" className={field} name="candidateStatus" defaultValue={filters.candidateStatus}>
        <option value="all">All statuses</option>{Object.entries(CANDIDATE_STATUSES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
      </select></div>
      <label className="min-w-0 space-y-1 text-sm">From (UTC)<input className={field} type="date" name="from" defaultValue={filters.from} /></label>
      <label className="min-w-0 space-y-1 text-sm">Through (UTC)<input className={field} type="date" name="to" defaultValue={filters.to} /></label>
      <div className="flex flex-wrap items-end gap-3"><FilterSubmitButton>Apply filters</FilterSubmitButton><Link className="py-2 text-sm underline" href="/dashboard/inbox">Reset filters</Link></div>
    </Form>
    {error ? <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">{error}</p> : inbox && <>
      <div role="group" aria-label="Inbox counts" className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
        {Object.entries(INBOX_CATEGORIES).map(([key, label]) => <Link key={key} href={inboxHref(filters, { category: key as keyof typeof INBOX_CATEGORIES, page: 1 })} aria-current={filters.category === key ? "page" : undefined} className={`rounded-xl border p-3 ${filters.category === key ? "border-primary bg-primary/5" : "bg-card"}`}>
          <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{inbox.counts[key as keyof typeof INBOX_CATEGORIES]}</p>
        </Link>)}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{inbox.counts.matching} matching response{inbox.counts.matching === 1 ? "" : "s"} · Newest interview starts first. Counts respect interview, review-status and UTC start-date filters; attention categories overlap.</p>
      {!inbox.rows.length ? <div className="rounded-xl border border-dashed p-8 text-center">
        <h2 className="font-semibold">{filters.page > 1 ? "No results on this page" : "No attention items match these filters"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Only completed responses from your account appear here. Try another filter or refresh after interviews finish.</p>
        {filters.page > 1 && <Link className="mt-3 inline-block text-sm underline" href={inboxHref(filters, { page: 1 })}>Back to first page</Link>}
      </div> : <ul aria-label="Review inbox candidates" className="divide-y rounded-xl border bg-card">
        {inbox.rows.map((row) => {
          const state = row.analysisState;
          return <li key={row.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="min-w-0 flex-1 basis-64">
              <Link prefetch={false} className="break-words font-semibold underline-offset-4 hover:underline" href={`/dashboard/interviews/${row.interviewId}/responses/${row.id}`}>{row.name || "Anonymous candidate"}</Link>
              {row.email && <p className="break-all text-sm text-muted-foreground">{row.email}</p>}
              <Link prefetch={false} className="mt-1 inline-block break-words text-sm underline" href={`/dashboard/interviews/${row.interviewId}`}>{row.interviewName}</Link>
              <p className="mt-1 text-xs text-muted-foreground">Started {row.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "UTC" })} (UTC)</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {!row.isViewed && <span className="rounded-full bg-primary/10 px-2 py-1">Unopened report</span>}
                {row.candidateStatus === "none" && <span className="rounded-full bg-muted px-2 py-1">Needs decision</span>}
                {state === "failed" && <span className="rounded-full bg-destructive/10 px-2 py-1">Analysis failed or stalled</span>}
                {state === "running" && <span className="rounded-full bg-muted px-2 py-1">Analysis in progress</span>}
                {!row.hasRecording && <span className="rounded-full bg-amber-500/15 px-2 py-1">{row.recordingPending ? "Recording pending" : "Recording missing"}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs ${CANDIDATE_STATUSES[row.candidateStatus].className}`}>{CANDIDATE_STATUSES[row.candidateStatus].label}</span>
              {state === "failed" && <InboxRetryButton responseId={row.id} />}
            </div>
          </li>;
        })}
      </ul>}
      <nav aria-label="Inbox pages" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        {filters.page > 1 ? <Link className="underline" href={inboxHref(filters, { page: filters.page - 1 })}>Previous page</Link> : <span />}
        <span>Page {filters.page}{inbox.counts.matching ? ` of ${Math.ceil(inbox.counts.matching / INBOX_PAGE_SIZE)}` : ""}</span>
        {inbox.hasNext && filters.page < INBOX_MAX_PAGE ? <Link className="underline" href={inboxHref(filters, { page: filters.page + 1 })}>Next page</Link> : <span />}
      </nav>
      {inbox.hasNext && filters.page === INBOX_MAX_PAGE && <p className="mt-2 text-sm">Narrow the date or interview filters to browse older responses beyond this page.</p>}
    </>}
    <p className="mt-6 text-xs text-muted-foreground">Reading this inbox never marks reports as viewed, changes decisions or starts AI analysis. Missing recordings may still arrive during the candidate’s three-hour upload window; only their original browser can recover a local copy.</p>
  </>;
}
