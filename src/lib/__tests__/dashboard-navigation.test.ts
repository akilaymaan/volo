import { expect, it } from "vitest";
import { canPrefetchDashboard } from "@/lib/dashboard-navigation";

it("allows preloading only explicitly read-only dashboard pages and their fragments", () => {
  for (const href of ["/dashboard", "/dashboard#activity", "/dashboard#interviews", "/dashboard/inbox", "/dashboard/templates", "/dashboard/interviewers", "/dashboard/privacy", "/dashboard/interviews/new"])
    expect(canPrefetchDashboard(href)).toBe(true);
});

it("never preloads report views, finalizing interview pages, exports, mutations or query-driven editors", () => {
  for (const href of ["/dashboard/interviews/role", "/dashboard/interviews/role/responses/report", "/dashboard/interviews/role/compare",
    "/dashboard/interviews/new?duplicate=private", "/dashboard/interviews/new?template=private", "/api/call/end", "/api/interviews/role/export",
    "/dashboard?ownerId=other", "https://example.test/dashboard", "//example.test/dashboard", "/dashboard/../api/call/end", null, undefined,
    { pathname: "/dashboard" }, "/dashboard/inbox/extra", "/dashboard/usage", "/dashboard/admin/usage"])
    expect(canPrefetchDashboard(href)).toBe(false);
});
