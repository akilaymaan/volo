import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/lib/db";
import { guestEntry } from "@/lib/guest-entry";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, disableSignUp: process.env.ENABLE_EMAIL_SIGNUP !== "1" },
  plugins: [guestEntry(), nextCookies()],
});

// Deduplicates layout/page checks within one server render, never across requests/users.
export const getUser = cache(async () => {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user ?? null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}
