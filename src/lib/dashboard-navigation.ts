/** Only routes whose render cannot mark a report viewed or schedule provider work. */
const READ_ONLY_ROUTES = new Set([
  "/dashboard", "/dashboard/inbox", "/dashboard/interviewers", "/dashboard/templates",
  "/dashboard/privacy", "/dashboard/interviews/new",
]);

export function canPrefetchDashboard(href: unknown) {
  // Queries may contain a template/duplicate ID whose authorization must remain fresh.
  return typeof href === "string" && READ_ONLY_ROUTES.has(href.split("#")[0]);
}
