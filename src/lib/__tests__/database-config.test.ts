import { expect, it } from "vitest";
import postgres from "postgres";
import { databaseMode, postgresConfig } from "@/lib/db/config.mjs";

it("requires PostgreSQL unless PGlite is explicitly selected", () => {
  expect(() => databaseMode({})).toThrow(/DATABASE_URL is required/);
  expect(databaseMode({ DATABASE_URL: "postgresql://placeholder" })).toBe("postgres");
  expect(databaseMode({ DATABASE_MODE: "pglite" })).toBe("pglite");
  expect(() => databaseMode({ DATABASE_MODE: "unknown" })).toThrow(/DATABASE_MODE/);
  expect(() => databaseMode({ DATABASE_MODE: "pglite", DATABASE_URL: "postgresql://placeholder" })).toThrow(/ambiguous/);
  expect(() => databaseMode({ DATABASE_MODE: "pglite", VERCEL: "1" })).toThrow(/hosted/);
  expect(() => databaseMode({ DATABASE_MODE: "pglite", RENDER: "true" })).toThrow(/hosted/);
});

it.each(["", "?sslmode=require", "?sslmode=verify-full", "?sslmode=verify-ca"])(
  "enforces certificate-verifying TLS in the actual installed driver: %s", async (suffix) => {
    const { url, ...options } = postgresConfig(`postgresql://user:secret@ep-test-pooler.example.test/neondb${suffix}`);
    const client = postgres(url, { ...options, max: 5 });
    try {
      expect(client.options.ssl).toEqual({ rejectUnauthorized: true });
      expect(client.options.prepare).toBe(false);
      expect(new URL(url).searchParams.has("sslmode")).toBe(false);
      expect(client.options.connection).not.toHaveProperty("channel_binding");
    } finally { await client.end(); }
  },
);

it("allows plaintext only when explicitly selected on loopback", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"])
    expect(postgresConfig(`postgresql://user:pass@${host}:5432/test?sslmode=disable`).ssl).toBe(false);
  expect(() => postgresConfig("postgresql://user:pass@remote.example/test?sslmode=disable")).toThrow(/loopback/);
  expect(() => postgresConfig("postgresql://user:pass@remote.example/test?sslmode=prefer")).toThrow(/verify-full/);
});

it("rejects unsupported channel binding and invalid URLs without echoing credentials", () => {
  expect(() => postgresConfig(undefined)).toThrow(/DATABASE_URL is required/);
  for (const raw of [
    "postgresql://user:do-not-print@remote.example/neondb?channel_binding=require",
    "postgresql://user:do-not-print@remote.example/neondb?ssl=false",
    "https://user:do-not-print@remote.example/neondb",
    "do-not-print",
  ]) {
    let message = "";
    try { postgresConfig(raw); } catch (error) { message = (error as Error).message; }
    expect(message).not.toBe("");
    expect(message).not.toContain("do-not-print");
    expect(message).not.toContain(raw);
  }
});
