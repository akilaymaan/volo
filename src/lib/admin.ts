import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isGuestUser } from "@/lib/guest-identity";

/** Deployment-controlled IDs, never client input or an unverified signup email. */
export function isAdminUser(user: { id: string; email?: string | null } | null | undefined) {
  if (!user?.id) return false;
  if (isGuestUser(user)) return false;
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(user.id);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminUser(user)) notFound();
  return user;
}
