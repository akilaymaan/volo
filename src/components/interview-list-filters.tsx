import Form from "next/form";
import Link from "next/link";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import type { parseInterviewFilters } from "@/lib/dashboard-filters";

export function InterviewListFilters({ filters }: { filters: ReturnType<typeof parseInterviewFilters> }) {
  return <Form action="/dashboard" className="mb-5 flex flex-wrap items-end gap-3" aria-label="Filter interviews">
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-muted-foreground">Search interviews
      <input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Search by interview name" className="h-10 min-w-0 rounded-lg border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
    </label>
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">Status
      <select name="status" defaultValue={filters.status} className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"><option value="all">All interviews</option><option value="live">Live only</option><option value="paused">Paused only</option></select>
    </label>
    <FilterSubmitButton>Search</FilterSubmitButton>
    {(filters.q || filters.status !== "all") && <Link href="/dashboard" className="py-3 text-xs text-muted-foreground underline">Clear filters</Link>}
  </Form>;
}
