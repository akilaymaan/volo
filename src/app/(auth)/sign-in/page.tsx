import { AuthForm } from "@/components/auth-form";
import { GuestEntry } from "@/components/guest-entry";
import Link from "next/link";
import { AudioLinesIcon, ArrowUpRightIcon } from "lucide-react";

export const metadata = { title: "Enter Volo" };

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  if ((await searchParams).method === "account" || process.env.GUEST_ENTRY_ENABLED === "0") return <>
    <h1 className="text-3xl font-bold">Welcome back</h1>
    <p className="mb-8 mt-2 text-muted-foreground">Sign in to your existing workspace.</p>
    <AuthForm mode="sign-in" allowSignUp={process.env.ENABLE_EMAIL_SIGNUP === "1"} />
    <Link href="/sign-in" className="mt-5 text-center text-sm text-muted-foreground underline underline-offset-4">Back to one-click entry</Link>
  </>;
  return (
    <>
      <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground"><AudioLinesIcon className="size-3.5" />Less setup. More conversation.</span>
      <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">Great interviews.<br /><span className="text-muted-foreground">One click away.</span></h1>
      <p className="mb-8 mt-5 leading-relaxed text-muted-foreground">Your next great hire starts with a conversation. Step into your workspace—no email, no password, no signup.</p>
      <GuestEntry />
      <Link href="/sign-in?method=account" className="mt-8 inline-flex items-center justify-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">Use an existing account<ArrowUpRightIcon className="size-3" /></Link>
    </>
  );
}
