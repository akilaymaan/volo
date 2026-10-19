import "server-only";
import { randomUUID } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getIP, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { takeRateLimit } from "@/lib/rate-limit";

/** Uses the existing auth user/session tables and Better Auth's signed cookies. */
export function guestEntry() {
  return {
    id: "volo-guest-entry",
    endpoints: {
      enterGuest: createAuthEndpoint("/guest-entry", { method: "POST" }, async (ctx) => {
        if (process.env.GUEST_ENTRY_ENABLED === "0") throw new APIError("FORBIDDEN", { message: "Guest entry is disabled." });
        const origin = ctx.headers?.get("origin");
        if (!origin || !ctx.context.isTrustedOrigin(origin)) throw new APIError("FORBIDDEN", { message: "Entry must start on this site." });
        // Never replace a valid existing account/session with a new guest.
        if (await getSessionFromCtx(ctx, { disableRefresh: true })) return ctx.json({ ok: true });
        const ip = getIP(ctx.request ?? ctx.headers ?? new Headers(), ctx.context.options) ?? "unknown";
        if (!(await takeRateLimit(`guest:ip:${ip}`, 10, 3_600_000)) ||
            !(await takeRateLimit("guest:global", 200, 86_400_000))) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "Too many new workspaces. Please try again later." });
        }
        const user = await ctx.context.internalAdapter.createUser({
          name: "Guest workspace", email: `guest-${randomUUID()}@guest.volo.invalid`, emailVerified: false,
        }, { method: "anonymous" });
        if (!user) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create your workspace." });
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not start your session." });
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ ok: true });
      }),
    },
  } satisfies BetterAuthPlugin;
}
