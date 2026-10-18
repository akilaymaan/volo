"use client";

import { ChartNoAxesColumnIcon, FilesIcon, LogOutIcon, MenuIcon, MessagesSquareIcon, PlusIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Interviews", icon: MessagesSquareIcon },
  { href: "/dashboard/interviewers", label: "Interviewers", icon: UsersRoundIcon },
  { href: "/dashboard/templates", label: "Templates", icon: FilesIcon },
  { href: "/dashboard/usage", label: "Usage and privacy", icon: ChartNoAxesColumnIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      <Button asChild className="mb-4 h-10 justify-start">
        <Link href="/dashboard/interviews/new" onClick={onNavigate}>
          <PlusIcon /> New interview
        </Link>
      </Button>
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === href || pathname.startsWith("/dashboard/interviews")
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 min-w-0 flex-1 justify-start gap-2 px-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {(name || email).charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm">{name || email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppNav({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
        <Logo href="/dashboard" className="mb-6 px-2" />
        <NavLinks />
        <div className="mt-auto flex items-center gap-1">
          <UserMenu name={name} email={email} />
          <ThemeToggle />
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo href="/dashboard" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar px-3 py-5">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Logo href="/dashboard" className="mb-6 px-2" />
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto flex items-center gap-1">
              <UserMenu name={name} email={email} />
              <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  );
}
