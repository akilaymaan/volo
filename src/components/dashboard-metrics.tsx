import { MoreVerticalIcon } from "lucide-react";
import Link from "next/link";
import type { dashboardAnalytics } from "@/lib/dashboard-data";
import type { ReactNode } from "react";
import styles from "@/components/dashboard-overview.module.css";

function MetricCard({ title, description, value, href, linkLabel }: { title: string; description: string; value: ReactNode; href: string; linkLabel: string }) {
  return <article className={`${styles.card} ${styles.metric}`}>
    <div className={styles.metricBody}><div className={styles.cardHead}><h2 className={styles.cardTitle}>{title}</h2>
      <Link href={href} prefetch={false} aria-label={linkLabel} className={styles.menuButton}><MoreVerticalIcon size={15} /></Link></div>
      <p className={styles.description}>{description}</p></div>
    <div className={styles.metricValue}>{value}</div>
  </article>;
}

export function DashboardMetrics({ totals, active }: { totals: Awaited<ReturnType<typeof dashboardAnalytics>>["totals"]; active: number }) {
  const groups = [
    { key: "shortlisted" as const, label: "Shortlisted", description: "Selected by you to move forward in the process", color: "linear-gradient(90deg, #5f8ce8, #2c65e3)" },
    { key: "none" as const, label: "Needs decision", description: "Completed interviews awaiting your review", color: "linear-gradient(90deg, #65d5e9, #2ec5e4)" },
    { key: "maybe" as const, label: "Maybe", description: "Candidates you have marked for further consideration", color: "#929292" },
    { key: "rejected" as const, label: "Rejected", description: "Candidates you have chosen not to progress", color: "#090909" },
  ];
  const duration = totals.avgDuration == null ? "—" : `${Math.floor(totals.avgDuration / 60)}m ${String(totals.avgDuration % 60).padStart(2, "0")}s`;
  return <div className={styles.bottomGrid}>
    <section className={`${styles.card} ${styles.distribution}`} aria-labelledby="distribution-title">
      <div className={styles.cardHead}><div><h2 id="distribution-title" className={styles.cardTitle}>Review distribution</h2><p className={styles.description}>Your candidate decisions across completed interviews.</p></div>
        <Link href="/dashboard/inbox" prefetch={false} className={styles.menuButton} aria-label="Open review inbox"><MoreVerticalIcon size={15} /></Link></div>
      <div className={styles.distributionRows}>{groups.map((group) => {
        const percentage = totals.completed ? Math.round(totals[group.key] / totals.completed * 100) : 0;
        return <div key={group.key}>
          <div className={styles.track} role="meter" aria-label={group.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${totals[group.key]} of ${totals.completed} completed interviews`}>
            <div className={styles.bar} style={{ width: `${totals.completed ? totals[group.key] / totals.completed * 100 : 0}%`, background: group.color }} />
          </div>
          <span className={styles.barLabel}>{group.label} — {percentage}% <span className="text-muted-foreground">({totals[group.key]})</span></span>
          <p className={styles.barDescription}>{group.description}</p>
        </div>;
      })}</div>
    </section>
    <div className={styles.metricGrid}>
      <MetricCard title="Average interview length" description="The average length of completed conversations in your selected date range." value={duration} href="/dashboard" linkLabel="Browse interviews for duration details" />
      <MetricCard title="Completion rate" description="The share of started interviews that candidates have completed in this period." value={totals.started ? `${Math.round(totals.completed / totals.started * 100)}%` : "—"} href="#activity" linkLabel="View completion activity" />
      <MetricCard title="Average candidate score" description="The average AI score across completed, successfully analyzed interviews. Human decisions stay separate." value={totals.avgScore == null ? "—" : `${totals.avgScore} / 100`} href="/dashboard/inbox" linkLabel="Review candidate reports" />
      <MetricCard title="Active interviews" description="Live interviews currently accepting candidates, matching your name and status filters. Not date-limited." value={active} href="/dashboard?status=live" linkLabel="Browse active interviews" />
    </div>
  </div>;
}
