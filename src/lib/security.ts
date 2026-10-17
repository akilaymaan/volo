import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const cookieName = (id: string) => `volo_call_${id}`;

export function validToken(token: string, hash: string | null, expires: Date | null) {
  if (!hash || !expires || expires.getTime() <= Date.now() || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sessionCookie(id: string, token: string, secure: boolean) {
  return `${cookieName(id)}=${token}; Path=/api/call; HttpOnly; SameSite=Lax; Max-Age=10800${secure ? "; Secure" : ""}`;
}

export function secureCallCookie(requestUrl: string, publicUrl = process.env.BETTER_AUTH_URL) {
  // TLS may terminate at the host's proxy while Next.js sees an internal HTTP URL.
  return new URL(requestUrl).protocol === "https:" || (!!publicUrl && new URL(publicUrl).protocol === "https:");
}

export function readSessionCookie(req: Request, id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) return "";
  const prefix = `${cookieName(id)}=`;
  return (req.headers.get("cookie") ?? "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith(prefix))?.slice(prefix.length) ?? "";
}
