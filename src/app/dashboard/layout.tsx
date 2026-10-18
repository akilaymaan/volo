import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();
  const missing = ["ANTHROPIC_API_KEY", "SARVAM_API_KEY"].filter((k) => !process.env[k]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppNav name={user.name} email={user.email} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-6xl">
          {missing.length > 0 && (
            <div role="alert" className="mb-6 rounded-xl border border-signal/50 bg-signal/10 px-4 py-3 text-sm">
              <strong>Finish setup:</strong> add {missing.join(" and ")} to your environment, then restart. Until then,
              question generation and live interviews won&apos;t work.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
