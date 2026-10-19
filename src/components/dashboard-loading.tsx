export default function DashboardLoading() {
  return <section role="status" aria-live="polite" aria-label="Loading dashboard content" className="dashboard-loading">
    <p className="text-sm text-muted-foreground">Loading page…</p>
    <div aria-hidden="true" className="dashboard-loading-line" />
    <div aria-hidden="true" className="dashboard-loading-cards">
      {[0, 1, 2].map((key) => <div key={key} className="dashboard-loading-card" />)}
    </div>
  </section>;
}
