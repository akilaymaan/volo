"use client";

import { MoreVerticalIcon } from "lucide-react";
import { useId, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "@/components/dashboard-overview.module.css";

export function DashboardChart({ months }: { months: { month: string; count: number }[] }) {
  const gradient = useId();
  const [table, setTable] = useState(false);
  const maximum = Math.max(4, Math.ceil(Math.max(...months.map((item) => item.count), 0) / 4) * 4);
  const points = months.map((item, index) => ({ ...item, x: months.length === 1 ? 550 : index / (months.length - 1) * 1100, y: 210 - item.count / maximum * 210 }));
  const total = months.reduce((sum, month) => sum + month.count, 0);
  const label = (month: string, full = false) => new Intl.DateTimeFormat("en-GB", { month: full ? "long" : "short", ...(full ? { year: "numeric" as const } : {}), timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const csv = `Month,Completed interviews\r\n${months.map((item) => `${item.month},${item.count}`).join("\r\n")}\r\n`;
  return <>
    <section id="activity" aria-labelledby="activity-title" className={`${styles.card} ${styles.chartCard}`}>
      <div className={styles.cardHead}>
        <div><h2 id="activity-title" className={styles.cardTitle}>Interview activity</h2>
          <p className={styles.description}>The total number of completed interviews on a month to month basis.</p></div>
        <DropdownMenu>
          <DropdownMenuTrigger className={styles.menuButton} aria-label="Interview activity options"><MoreVerticalIcon size={15} /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setTable(!table)}>{table ? "Hide" : "View"} data table</DropdownMenuItem>
            <DropdownMenuItem asChild><a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download="interview-activity.csv">Download chart CSV</a></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={styles.chart}>
        <div className={styles.yLabels} aria-hidden="true">{[maximum, maximum * .75, maximum * .5, maximum * .25, 0].map((value) => <span key={value}>{value}</span>)}</div>
        <svg className={styles.chartSvg} viewBox="0 0 1100 210" preserveAspectRatio="none" role="img" aria-label={`Monthly completed interviews: ${total} total. Use the chart menu for a data table.`}>
          <defs><linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0"><stop stopColor="#7251da" /><stop offset=".55" stopColor="#b56a9f" /><stop offset="1" stopColor="#ed887e" /></linearGradient></defs>
          {[0, 52.5, 105, 157.5, 210].map((y) => <line key={y} x1="0" x2="1100" y1={y} y2={y} stroke="var(--border)" opacity=".28" vectorEffect="non-scaling-stroke" />)}
          {points.map((point) => <line key={point.month} x1={point.x} x2={point.x} y1="0" y2="210" stroke="var(--border)" opacity=".18" vectorEffect="non-scaling-stroke" />)}
          <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={`url(#${gradient})`} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
          {points.map((point) => <circle key={point.month} cx={point.x} cy={point.y} r="4" tabIndex={0} role="img" aria-label={`${label(point.month, true)}: ${point.count} completed`} className={styles.chartPoint}><title>{label(point.month, true)}: {point.count} completed</title></circle>)}
        </svg>
        {total === 0 && <p className={styles.chartEmpty}>No completed interviews in this date range</p>}
        <div className={styles.xLabels} aria-hidden="true">{months.map((item) => <span key={item.month}>{label(item.month)}</span>)}</div>
      </div>
    </section>
    {table && <table className={styles.dataTable}><caption className="sr-only">Monthly interview activity (UTC)</caption><thead><tr><th scope="col">Month (UTC)</th><th scope="col">Completed interviews</th></tr></thead><tbody>{months.map((item) => <tr key={item.month}><th scope="row">{label(item.month, true)}</th><td>{item.count}</td></tr>)}</tbody></table>}
  </>;
}
