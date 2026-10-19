"use client";

import { ChevronsUpDownIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { DashboardLink } from "@/components/dashboard-link";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "@/components/dashboard-shell.module.css";

export function SidebarAccountMenu({ name, email, compact = false, onNavigate }: { name: string; email: string; compact?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = name.trim() || email;
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
  return <div className={styles.accountFooter}><DropdownMenu>
    <DropdownMenuTrigger className={styles.accountButton} aria-label="Account menu" title={compact ? displayName : undefined}>
      <span className={styles.accountAvatar} aria-hidden="true">{initials}</span>
      {!compact && <>
        <span className={styles.accountIdentity}><strong>{displayName}</strong><small>{email}</small></span>
        <ChevronsUpDownIcon size={12} className="shrink-0" aria-hidden="true" />
      </>}
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" sideOffset={12} className="w-60">
      <DropdownMenuLabel className="break-words text-xs font-normal">{email}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        <SunIcon className="hidden dark:block" /><MoonIcon className="dark:hidden" />Toggle dark mode
      </DropdownMenuItem>
      <DropdownMenuItem asChild><DashboardLink href="/dashboard/privacy" onClick={onNavigate}>Privacy and data retention</DashboardLink></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={signingOut} onSelect={async () => {
        setSigningOut(true);
        try {
          const result = await authClient.signOut();
          if (result.error) throw new Error("Sign out failed");
          onNavigate?.(); router.push("/sign-in"); router.refresh();
        } catch { toast.error("Could not sign out. Please try again."); setSigningOut(false); }
      }}><LogOutIcon />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu></div>;
}
