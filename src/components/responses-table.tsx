"use client";

import { AlertTriangleIcon, Loader2Icon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bulkReviewCandidatesAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { scoreTone } from "@/components/score";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANDIDATE_STATUSES, MAX_BULK_REVIEW, RECOMMENDATIONS } from "@/lib/constants";
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
type Status = keyof typeof CANDIDATE_STATUSES;

export function ResponsesTable({ interviewId, rows }: { interviewId: string; rows: ResponseRow[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const router = useRouter();
  const [selected, setSelected] = useState<{ id: string; status: Status }[]>([]);
  const [target, setTarget] = useState<Status>("shortlisted");
  const [confirmation, setConfirmation] = useState<{ candidates: typeof selected; names: string[]; status: Status } | null>(null);
  const [pending, start] = useTransition();

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
  const visibleIds = new Set(shown.map((r) => r.id));
  const selection = selected.filter((r) => visibleIds.has(r.id));
  const locked = pending || !!confirmation;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected([]); }}
            disabled={locked}
            placeholder="Search by name or email"
            aria-label="Search candidates"
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} disabled={locked} onValueChange={(value) => { setStatus(value); setSelected([]); }}>
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
        <Select value={sort} disabled={locked} onValueChange={setSort}>
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

      {rows.length > 0 && <section aria-label="Bulk candidate review" className="mb-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="mr-auto text-sm font-medium">{selection.length} selected</p>
          <Button variant="outline" disabled={locked || !shown.length} onClick={() => setSelected(shown.slice(0, MAX_BULK_REVIEW).map((r) => ({ id: r.id, status: r.candidateStatus })))}>
            Select {shown.length > MAX_BULK_REVIEW ? `first ${MAX_BULK_REVIEW} shown` : "shown"}
          </Button>
          <Button variant="ghost" disabled={locked || !selection.length} onClick={() => setSelected([])}>Clear selection</Button>
          <Select value={target} disabled={locked} onValueChange={(value) => setTarget(value as Status)}>
            <SelectTrigger className="w-40" aria-label="Bulk candidate status"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CANDIDATE_STATUSES).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={locked || !selection.length} onClick={() => setConfirmation({
            candidates: selection, status: target,
            names: selection.map((s) => {
              const row = shown.find((r) => r.id === s.id)!;
              return row.name && row.email ? `${row.name} (${row.email})` : row.name || row.email || "Anonymous candidate";
            }),
          })}>{pending ? "Updating…" : "Review selection"}</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Select up to {MAX_BULK_REVIEW} candidates. Changing search or status filters clears selection. Review evidence before deciding; no candidate emails are sent.</p>
      </section>}

      <AlertDialog open={!!confirmation} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update {confirmation?.candidates.length} candidate statuses?</AlertDialogTitle>
            <AlertDialogDescription>Set the selected candidates to {confirmation ? CANDIDATE_STATUSES[confirmation.status].label : ""}. This replaces their current review status, not their AI assessment. No emails will be sent.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul aria-label="Candidates to update" className="max-h-48 overflow-y-auto text-sm">{confirmation?.names.map((name, i) => <li key={confirmation.candidates[i].id} className="break-words py-1">{name}</li>)}</ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button disabled={pending} variant={confirmation?.status === "rejected" ? "destructive" : "default"} onClick={() => {
              if (!confirmation) return;
              const confirmed = confirmation;
              start(async () => {
                try {
                  const result = await bulkReviewCandidatesAction({ interviewId, candidates: confirmed.candidates, status: confirmed.status });
                  if (!result.ok) toast.error(result.error);
                  else toast.success(`${result.count} candidate statuses updated`);
                  setSelected([]);
                } catch {
                  toast.error("Could not confirm the update. Refresh and check candidate statuses before trying again.");
                  setSelected([]);
                } finally { setConfirmation(null); router.refresh(); }
              });
            }}>{pending ? "Updating…" : "Confirm status update"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                <input type="checkbox" className="relative z-10 size-4 shrink-0 accent-primary" aria-label={`Select for review: ${r.name || r.email || "Anonymous candidate"}`}
                  checked={selection.some((s) => s.id === r.id)}
                  disabled={locked || (selection.length >= MAX_BULK_REVIEW && !selection.some((s) => s.id === r.id))}
                  onChange={(e) => setSelected(e.target.checked ? [...selection, { id: r.id, status: r.candidateStatus }] : selection.filter((s) => s.id !== r.id))} />
                <div className="min-w-0 flex-1 basis-[calc(100%_-_2rem)] sm:basis-0">
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
                <div className="ml-auto w-28 text-right">
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
