"use client";

import { SearchIcon } from "lucide-react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/dashboard-shell.module.css";

const destinations = [
  { name: "Interviews", href: "/dashboard#interviews" }, { name: "New interview", href: "/dashboard/interviews/new" },
  { name: "Review inbox", href: "/dashboard/inbox" }, { name: "Interviewers", href: "/dashboard/interviewers" },
  { name: "Templates", href: "/dashboard/templates" }, { name: "Privacy and data retention", href: "/dashboard/privacy" },
];

function InterviewSearchResults({ interviews, query, onNavigate, hasPageMatches }: { interviews: Promise<{ id: string; name: string }[] | null>; query: string; onNavigate: () => void; hasPageMatches: boolean }) {
  const rows = use(interviews);
  const router = useRouter();
  if (!rows) return <p className="px-3 py-2 text-muted-foreground">Interview search unavailable. <button type="button" className="underline" onClick={() => router.refresh()}>Refresh to retry</button></p>;
  const matches = rows.filter((iv) => iv.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    {matches.map((iv) => <Link href={`/dashboard/interviews/${iv.id}`} prefetch={false} key={iv.id} onClick={onNavigate}>{iv.name}</Link>)}
    {matches.length === 0 && !hasPageMatches
      && <p className="px-3 py-5 text-muted-foreground">No matching pages or interviews.</p>}
  </>;
}

export function DashboardHeader({ interviews, isAdmin }: { interviews: Promise<{ id: string; name: string }[] | null>; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const title = pathname === "/dashboard" ? "Interviews" : pathname.startsWith("/dashboard/inbox") ? "Review inbox"
    : pathname.startsWith("/dashboard/interviewers") ? "Interviewers" : pathname.startsWith("/dashboard/templates") ? "Templates"
      : pathname.startsWith("/dashboard/privacy") ? "Privacy and data retention"
        : pathname.startsWith("/dashboard/admin/usage") ? "API usage" : "Interviews";
  const options = [...destinations, ...(isAdmin ? [{ name: "API usage", href: "/dashboard/admin/usage" }] : [])]
    .filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <header className={styles.header}>
      {pathname === "/dashboard" ? <h1 className={styles.title}>{title}</h1> : <div className={styles.title}>{title}</div>}
      <div className={styles.headerActions}>
        <button type="button" className={styles.quick} aria-label="Search quick actions" onClick={() => { setQuery(""); setOpen(true); }}>
          <SearchIcon size={15} aria-hidden="true" /><span className="flex-1">Quick actions</span><kbd>⌘</kbd><kbd>K</kbd>
        </button>
      </div>
    </header>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Quick actions</DialogTitle>
        <DialogDescription>Find a page or one of your interviews.</DialogDescription>
        <input aria-label="Search pages and interviews" placeholder="Search pages and interviews…" className={styles.searchInput}
          value={query} onChange={(event) => setQuery(event.target.value)} />
        <nav aria-label="Quick action results" className={styles.searchResults}>
          {options.map((item) => <Link href={item.href} key={item.href} onClick={() => setOpen(false)}>{item.name}</Link>)}
          <Suspense fallback={<p role="status" className="px-3 py-2 text-muted-foreground">Loading interviews…</p>}>
            <InterviewSearchResults interviews={interviews} query={query} hasPageMatches={options.length > 0} onNavigate={() => setOpen(false)} />
          </Suspense>
        </nav>
      </DialogContent>
    </Dialog>
  </>;
}
