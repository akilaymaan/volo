import { CalendarDaysIcon, XIcon } from "lucide-react";
import Link from "next/link";
import Form from "next/form";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import type { DashboardFilters as Filters } from "@/lib/dashboard-filters";
import styles from "@/components/dashboard-overview.module.css";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function DashboardFilters({ filters }: { filters: Filters }) {
  return <div className={styles.toolbar}>
    <details className={styles.filter}>
      <summary><CalendarDaysIcon size={15} aria-hidden="true" />{dateLabel(filters.from)} – {dateLabel(filters.to)}</summary>
      <Form action="/dashboard/analytics" className={styles.filterPanel}>
        <input type="hidden" name="q" value={filters.q} /><input type="hidden" name="status" value={filters.status} />
        <label>From (UTC)<input type="date" name="from" defaultValue={filters.from} required /></label>
        <label>Through (UTC)<input type="date" name="to" defaultValue={filters.to} required /></label>
        <p>Response dates, inclusive. Select a range of up to 367 days.</p>
        <FilterSubmitButton>Apply dates</FilterSubmitButton>
      </Form>
    </details>
    <div className={styles.toolbarRight}>
      {(filters.q || filters.status !== "all") && <Link href="/dashboard/analytics" className={styles.reset} aria-label="Clear analytics filters"><XIcon size={13} /></Link>}
      <details className={styles.filter}>
        <summary>{filters.q || filters.status !== "all" ? "Edit filters" : "Add filter"}</summary>
        <Form action="/dashboard/analytics" className={`${styles.filterPanel} ${styles.rightPanel}`}>
          <input type="hidden" name="from" value={filters.from} /><input type="hidden" name="to" value={filters.to} />
          <label>Interview name<input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Search interviews…" /></label>
          <div><label htmlFor="dashboard-interview-status">Interview status</label><select id="dashboard-interview-status" name="status" defaultValue={filters.status}><option value="all">All interviews</option><option value="live">Live only</option><option value="paused">Paused only</option></select></div>
          <p>Applies to the charts and metrics on this page.</p>
          <FilterSubmitButton>Apply filters</FilterSubmitButton>
        </Form>
      </details>
      <Link href="/dashboard/interviews/new" prefetch={false}>New interview</Link>
    </div>
  </div>;
}
