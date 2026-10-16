import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 font-heading text-lg font-bold tracking-tight", className)}
    >
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <circle cx="16" cy="16" r="15" className="fill-primary" />
        <path
          d="M9 17.5v-3M13 21v-10M17 19v-6M21 22v-12M25 17.5v-3"
          className="stroke-primary-foreground"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <span>Volo</span>
    </Link>
  );
}
