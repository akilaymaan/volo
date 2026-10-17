import { expect, it } from "vitest";
import { cookieName, newToken, readSessionCookie, secureCallCookie, sessionCookie, tokenHash, validToken } from "@/lib/security";

it("uses independent 256-bit secrets and only accepts an unexpired matching hash", () => {
  const a = newToken(), b = newToken();
  expect(a).not.toBe(b);
  expect(a).toHaveLength(43);
  const hash = tokenHash(a);
  expect(hash).not.toContain(a);
  expect(validToken(a, hash, new Date(Date.now() + 10_000))).toBe(true);
  expect(validToken(b, hash, new Date(Date.now() + 10_000))).toBe(false);
  expect(validToken(a, hash, new Date(0))).toBe(false);
  expect(validToken(a, null, null)).toBe(false);
  expect(validToken(a, "invalid", new Date(Date.now() + 10_000))).toBe(false);
});

it("keeps candidate cookies Secure when HTTPS terminates at a deployment proxy", () => {
  expect(secureCallCookie("http://internal-render:10000/api/call/start", "https://volo.example.test")).toBe(true);
  expect(secureCallCookie("https://volo.example.test/api/call/start", "http://localhost:3000")).toBe(true);
  expect(secureCallCookie("http://localhost:3000/api/call/start", "http://localhost:3000")).toBe(false);
});

it("scopes HttpOnly cookies to call routes and separates concurrent candidate sessions", () => {
  const token = newToken();
  const cookie = sessionCookie("a_123", token, true);
  expect(cookie).toContain("HttpOnly; SameSite=Lax");
  expect(cookie).toContain("Path=/api/call");
  expect(cookie).toContain("; Secure");
  const req = new Request("https://localhost/api/call/turn", {
    headers: { cookie: `other=x; ${cookieName("a_123")}=${token}; ${cookieName("b_456")}=other` },
  });
  expect(readSessionCookie(req, "a_123")).toBe(token);
  expect(readSessionCookie(req, "unknown")).toBe("");
  expect(readSessionCookie(req, "../bad")).toBe("");
});
