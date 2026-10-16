"use client";

import { AlertTriangleIcon, Loader2Icon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { scoreTone } from "@/components/score";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANDIDATE_STATUSES, RECOMMENDATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type ResponseRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  durationSec: number;
  score: number | null;
  recommendation: keyof typeof RECOMMENDATIONS | null;
  analysisStatus: "running" | "done" | "failed";
  candidateStatus: keyof typeof CANDIDATE_STATUSES;
  tabSwitchCount: number;
  isViewed: boolean;
};

// Fixed locale + zone so server and browser render the same text (no hydration mismatch).
// shortcut: dates show in IST for everyone; pass the viewer's zone from a cookie if you serve other regions
const DATE_FMT = { day: "numeric", month: "short", timeZone: "Asia/Kolkata" } as const;

const fmtDuration = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

export function ResponsesTable({ interviewId, rows }: { interviewId: string; rows: ResponseRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => status === "all" || r.candidateStatus === status)
      .filter((r) => !needle || `${r.name} ${r.email}`.toLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "score"
          ? (b.score ?? -1) - (a.score ?? -1)
          : sort === "oldest"
            ? a.createdAt.localeCompare(b.createdAt)
            : b.createdAt.localeCompare(a.createdAt),
      );
  }, [rows, q, status, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            aria-label="Search candidates"
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All candidates</SelectItem>
            {Object.entries(CANDIDATE_STATUSES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-36" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="score">Highest score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? "No finished interviews yet. Share the link to get your first response." : "No candidates match these filters."}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((r) => {
            const st = CANDIDATE_STATUSES[r.candidateStatus];
            return (
              <li key={r.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/interviews/${interviewId}/responses/${r.id}`}
                    className="flex items-center gap-2 font-medium after:absolute after:inset-0"
                  >
                    {!r.isViewed && <span className="size-2 rounded-full bg-primary" aria-label="New" />}
                    <span className="truncate">{r.name || "Anonymous candidate"}</span>
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {r.email ? `${r.email}, ` : ""}
                    {new Date(r.createdAt).toLocaleDateString("en-IN", DATE_FMT)}, {fmtDuration(r.durationSec)}
                  </p>
                </div>
                {r.tabSwitchCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400" title="Times the candidate left the interview tab">
                    <AlertTriangleIcon className="size-3.5" /> {r.tabSwitchCount} tab switch{r.tabSwitchCount > 1 ? "es" : ""}
                  </span>
                )}
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.className)}>{st.label}</span>
                <div className="w-28 text-right">
                  {r.analysisStatus === "running" ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Loader2Icon className="size-3.5 animate-spin" /> Analyzing
                    </span>
                  ) : r.score != null ? (
                    <p className="leading-tight">
                      <span className={cn("font-heading text-lg font-semibold", scoreTone(r.score))}>{r.score}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.recommendation ? RECOMMENDATIONS[r.recommendation].label : ""}
                      </span>
                    </p>
                  ) : (
                    <span className="text-sm text-muted-foreground">{r.analysisStatus === "failed" ? "Analysis failed" : "Too short"}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
