"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";

export function LandingMobileMenu({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="sm:hidden">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation menu"><MenuIcon /></Button></SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,calc(100vw-2rem))] p-5 pt-6">
        <SheetTitle>Explore Volo</SheetTitle>
        <SheetDescription>Start an interview or return to your workspace.</SheetDescription>
        <nav aria-label="Mobile landing navigation" className="mt-4 flex flex-col gap-3">
          <Button asChild><Link href={authenticated ? "/dashboard" : "/sign-in"} onClick={() => setOpen(false)}>{authenticated ? "Open dashboard" : "Enter Volo"}</Link></Button>
          {!authenticated && <Button variant="outline" asChild><Link href="/sign-in?method=account" onClick={() => setOpen(false)}>Existing account</Link></Button>}
          <Button variant="ghost" asChild><a href="#how-it-works" onClick={() => setOpen(false)}>How it works</a></Button>
        </nav>
        <div className="mt-3 flex items-center justify-between gap-3 border-t pt-4"><span className="text-sm">Appearance</span><ThemeToggle /></div>
      </SheetContent>
    </Sheet>
  </div>;
}
