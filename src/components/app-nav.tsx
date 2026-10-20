"use client";

import { ArrowLeftToLineIcon, ArrowRightFromLineIcon, ChartNoAxesColumnIcon, FilesIcon, InboxIcon, MenuIcon, MessagesSquareIcon, PlusIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { Logo } from "@/components/brand";
import { SidebarAccountMenu } from "@/components/sidebar-account-menu";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import styles from "@/components/dashboard-shell.module.css";

function NavLinks({ collapsed, onNavigate, isAdmin }: { collapsed?: boolean; onNavigate?: () => void; isAdmin: boolean }) {
  const pathname = usePathname();
  const link = (href: string, label: string, Icon?: typeof MessagesSquareIcon, active?: boolean) => (
    <Link key={href} href={href} onClick={onNavigate} aria-label={label}
      title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={styles.navLink}>
      {Icon && <Icon aria-hidden="true" />}<span className={styles.navLabel}>{label}</span>
    </Link>
  );
  return <nav className={styles.nav} aria-label="Main">
    {link("/dashboard/interviews/new", "New interview", PlusIcon, pathname === "/dashboard/interviews/new")}
    {link("/dashboard", "Interviews", MessagesSquareIcon, pathname === "/dashboard" || pathname.startsWith("/dashboard/interviews/") && pathname !== "/dashboard/interviews/new")}
    {link("/dashboard/inbox", "Review inbox", InboxIcon, pathname.startsWith("/dashboard/inbox"))}
    {link("/dashboard/templates", "Templates", FilesIcon, pathname.startsWith("/dashboard/templates"))}
    {link("/dashboard/interviewers", "Interviewers", UsersRoundIcon, pathname.startsWith("/dashboard/interviewers"))}
    {link("/dashboard/analytics", "Analytics", ChartNoAxesColumnIcon, pathname.startsWith("/dashboard/analytics"))}
    {link("/dashboard/privacy", "Privacy and data retention", ShieldCheckIcon, pathname.startsWith("/dashboard/privacy"))}
    {isAdmin && link("/dashboard/admin/usage", "API usage", ChartNoAxesColumnIcon, pathname.startsWith("/dashboard/admin/usage"))}
  </nav>;
}

export function AppNav({ name, email, isAdmin }: { name: string; email: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <>
    <aside className={cn(styles.sidebar, collapsed && styles.collapsed)} aria-label="Sidebar">
      <div className={styles.navSticky}>
        <Logo href="/dashboard" inverted compact={collapsed} className={styles.sidebarBrand} />
        <NavLinks collapsed={collapsed} isAdmin={isAdmin} />
        <div className={styles.navBottom}>
          <button type="button" className={styles.collapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ArrowRightFromLineIcon size={15} /> : <ArrowLeftToLineIcon size={15} />}
            <span className={styles.navLabel}>Collapse</span>
          </button>
          <SidebarAccountMenu name={name} email={email} compact={collapsed} />
        </div>
      </div>
    </aside>
    <div className={styles.mobile}>
      <Logo href="/dashboard" inverted className={styles.mobileBrand} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label="Open menu"><MenuIcon size={19} /></SheetTrigger>
        <SheetContent side="left" className={cn("w-64", styles.mobileNav)}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className={styles.navSticky}><Logo href="/dashboard" inverted className={styles.sidebarBrand} /><NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
            <div className={styles.navBottom}><SidebarAccountMenu name={name} email={email} onNavigate={() => setOpen(false)} /></div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  </>;
}
