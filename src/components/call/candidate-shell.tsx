import Link from "next/link";

/** Keep setup, call, recovery and unavailable-link screens on the same neutral surface. */
export function CandidateShell({ children, recoveryLink = true }: { children: React.ReactNode; recoveryLink?: boolean }) {
  return <div data-candidate-surface="" className="dark flex min-h-dvh flex-col bg-background text-foreground">
    <div aria-hidden="true" className="h-1 bg-secondary" />
    {children}
    <p className="pb-4 text-center text-xs text-muted-foreground">
      Powered by <span className="font-heading font-semibold">Volo</span>
      {recoveryLink && <Link href="/recording-recovery" className="ml-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">Recording recovery</Link>}
    </p>
  </div>;
}
