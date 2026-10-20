import { expect, it } from "vitest";
import { parseInterviewFilters, parseDashboardFilters } from "@/lib/dashboard-filters";

it("keeps the interviews workspace filters simple and independent of analytics dates", () => {
  expect(parseInterviewFilters({})).toEqual({ q: "", status: "all" });
  expect(parseInterviewFilters({ q: "  Engineer  ", status: "live", from: "bad date" })).toEqual({ q: "Engineer", status: "live" });
});

it("validates interview search and status rather than accepting duplicate or invalid inputs", () => {
  for (const raw of [{ q: ["one", "two"] }, { q: "a".repeat(101) }, { status: "unknown" }])
    expect(() => parseInterviewFilters(raw)).toThrow("Invalid interview filters");
});

it("retains strict date validation on the separate analytics page", () => {
  expect(() => parseDashboardFilters({ from: "2026-02-30" })).toThrow("Invalid dashboard filters");
});
