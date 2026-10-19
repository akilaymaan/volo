import { cn } from "@/lib/utils";

export const scoreTone = (score: number) =>
  score >= 75
    ? "text-foreground"
    : score >= 50
      ? "text-amber-700 dark:text-amber-400"
      : "text-rose-700 dark:text-rose-400";

export function ScoreBadge({ score, label }: { score: number | null | undefined; label?: string }) {
  return (
    <div className="w-12 text-right">
      <p className={cn("font-heading text-lg font-semibold leading-none", score != null ? scoreTone(score) : "text-muted-foreground")}>
        {score ?? "–"}
      </p>
      {label && <p className="mt-1 text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

/** Circular score gauge, 0–max. */
export function ScoreRing({ score, max = 100, size = 112, label }: { score: number; max?: number; size?: number; label: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / max));
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} role="img" aria-label={`${label}: ${score} out of ${max}`}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className={cn("stroke-current transition-[stroke-dashoffset] duration-700", scoreTone((score / max) * 100))}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl font-bold">
          {score}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
