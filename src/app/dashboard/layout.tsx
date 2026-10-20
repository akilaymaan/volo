import { AppNav } from "@/components/app-nav";
import { DashboardHeader } from "@/components/dashboard-header";
import { PageMotion } from "@/components/page-motion";
import { requireUser } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { inboxInterviews } from "@/lib/review-inbox";
import styles from "@/components/dashboard-shell.module.css";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();
  // Search names can stream independently; they must not hold up the whole shell.
  const interviews = inboxInterviews(user.id).catch(() => null);
  const missing = ["ANTHROPIC_API_KEY", "SARVAM_API_KEY"].filter((k) => !process.env[k]);
  return (
    <div className={styles.stage}>
      <div className={styles.shell}>
        <AppNav name={user.name} email={user.email} isAdmin={isAdminUser(user)} />
        <main className={styles.panel} id="main-content">
          <DashboardHeader interviews={interviews} isAdmin={isAdminUser(user)} />
          {isAdminUser(user) && missing.length > 0 && (
            <div role="alert" className={styles.setup}>
              <strong>Finish setup:</strong> add {missing.join(" and ")} to your environment, then restart. Until then,
              question generation and live interviews won&apos;t work.
            </div>
          )}
          <PageMotion>{children}</PageMotion>
        </main>
      </div>
    </div>
  );
}
