import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { guestEntry } from "@/lib/guest-entry";
import { isGuestUser } from "@/lib/guest-identity";
import { isAdminUser } from "@/lib/admin";

const mock = vi.hoisted(() => ({
  current: vi.fn(), limit: vi.fn(), cookie: vi.fn(), createUser: vi.fn(), createSession: vi.fn(), trusted: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ takeRateLimit: mock.limit }));
vi.mock("better-auth/cookies", () => ({ setSessionCookie: mock.cookie }));
vi.mock("better-auth/api", () => ({
  createAuthEndpoint: (_path: string, _options: unknown, handler: unknown) => handler,
  getSessionFromCtx: mock.current, getIP: () => "127.0.0.1",
  APIError: class extends Error { constructor(public status: string, body: { message: string }) { super(body.message); } },
}));

function context(origin: string | null = "http://localhost:3000") {
  return {
    headers: new Headers(origin ? { origin } : {}),
    context: { isTrustedOrigin: mock.trusted, options: {}, internalAdapter: { createUser: mock.createUser, createSession: mock.createSession } },
    json: (value: unknown) => value,
  };
}
const enter = () => guestEntry().endpoints.enterGuest as unknown as (ctx: ReturnType<typeof context>) => Promise<unknown>;
beforeEach(() => {
  vi.stubEnv("GUEST_ENTRY_ENABLED", "1");
  mock.current.mockResolvedValue(null);
  mock.limit.mockResolvedValue(true);
  mock.trusted.mockImplementation((origin) => origin === "http://localhost:3000");
  mock.createUser.mockResolvedValue({ id: "guest-id" });
  mock.createSession.mockResolvedValue({ id: "session-id" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("rejects missing/foreign origins and the disabled feature before creating accounts", async () => {
  await expect(enter()(context(null))).rejects.toMatchObject({ status: "FORBIDDEN" });
  await expect(enter()(context("https://foreign.example"))).rejects.toMatchObject({ status: "FORBIDDEN" });
  vi.stubEnv("GUEST_ENTRY_ENABLED", "0");
  await expect(enter()(context())).rejects.toMatchObject({ status: "FORBIDDEN" });
  expect(mock.createUser).not.toHaveBeenCalled();
  expect(mock.limit).not.toHaveBeenCalled();
});

it("preserves an existing authenticated workspace without rate-limit or creation side effects", async () => {
  mock.current.mockResolvedValue({ user: { id: "existing" } });
  expect(await enter()(context())).toEqual({ ok: true });
  expect(mock.createUser).not.toHaveBeenCalled();
  expect(mock.cookie).not.toHaveBeenCalled();
  expect(mock.limit).not.toHaveBeenCalled();
});

it("limits both per-IP and global guest creation", async () => {
  mock.limit.mockResolvedValueOnce(false);
  await expect(enter()(context())).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
  mock.limit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(enter()(context())).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
  expect(mock.createUser).not.toHaveBeenCalled();
});

it("creates a server-controlled guest identity and uses the auth library's session cookie", async () => {
  const ctx = context();
  expect(await enter()(ctx)).toEqual({ ok: true });
  const user = mock.createUser.mock.calls[0][0];
  expect(user.name).toBe("Guest workspace");
  expect(isGuestUser(user)).toBe(true);
  expect(user.emailVerified).toBe(false);
  expect(user).not.toHaveProperty("password");
  expect(user).not.toHaveProperty("id");
  expect(user).not.toHaveProperty("role");
  expect(mock.createSession).toHaveBeenCalledWith("guest-id");
  expect(mock.cookie).toHaveBeenCalledWith(ctx, { user: { id: "guest-id" }, session: { id: "session-id" } });
});

it("does not set a cookie if session creation fails and never grants guest admin access", async () => {
  mock.createSession.mockResolvedValue(null);
  await expect(enter()(context())).rejects.toMatchObject({ status: "INTERNAL_SERVER_ERROR" });
  expect(mock.cookie).not.toHaveBeenCalled();
  vi.stubEnv("ADMIN_USER_IDS", "guest-id");
  expect(isAdminUser({ id: "guest-id", email: "guest-01234567-0123-0123-0123-0123456789ab@guest.volo.invalid" })).toBe(false);
  expect(isGuestUser({ email: "person@example.test" })).toBe(false);
});
