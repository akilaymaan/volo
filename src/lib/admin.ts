import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Deployment-controlled IDs, never client input or an unverified signup email. */
export function isAdminUser(user: { id: string } | null | undefined) {
  if (!user?.id) return false;
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(user.id);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminUser(user)) notFound();
  return user;
}
