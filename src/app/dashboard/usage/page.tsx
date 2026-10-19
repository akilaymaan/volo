import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

// Protect old bookmarks too; no loading boundary may stream before this check.
export default async function LegacyUsagePage() {
  await requireAdmin();
  redirect("/dashboard/admin/usage");
}
