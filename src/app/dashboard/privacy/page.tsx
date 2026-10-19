import { requireUser } from "@/lib/auth";
import { accountRetentionCounts } from "@/lib/retention";
import { RetentionControls } from "@/components/retention-controls";

export const metadata = { title: "Privacy and data retention" };

export default async function PrivacyPage() {
  const user = await requireUser();
  const due = await accountRetentionCounts(user.id);
  return <>
    <h1 className="text-3xl font-bold">Privacy and data retention</h1>
    <p className="mt-2 text-muted-foreground">Manage candidate data in your account.</p>
    <section className="my-8 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Expired candidate data</h2>
      <p className="my-3 text-sm">{due.responses} response(s) and {due.invitations} expired invitation(s) are eligible for cleanup. Legacy responses without a retention date are not automatically deleted. Individual reports and interviews can also be deleted from their action menus.</p>
      <RetentionControls />
    </section>
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">How retention works</h2>
      <p className="mt-3 text-sm text-muted-foreground">Set candidate data retention when creating or editing an interview. Changes apply to new responses. Deleting expired data permanently removes eligible candidate records, recordings, reports and invitations from your account only. Scheduled cleanup must be configured by the platform administrator.</p>
      <p className="mt-4 text-xs text-muted-foreground">Your account ID: <code className="break-all select-all">{user.id}</code></p>
    </section>
  </>;
}
