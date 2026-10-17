// Shared by Next.js and the explicit migration process; never include URLs in errors.
export class DatabaseConfigError extends Error {}

/** @param {string | undefined} raw */
export function postgresConfig(raw) {
  if (!raw?.trim()) throw new DatabaseConfigError("DATABASE_URL is required for PostgreSQL. No local database was selected.");
  let url;
  try { url = new URL(raw); }
  catch { throw new DatabaseConfigError("DATABASE_URL must be a valid PostgreSQL connection URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
    throw new DatabaseConfigError("DATABASE_URL must specify a PostgreSQL host and database.");
  if (url.searchParams.has("channel_binding"))
    throw new DatabaseConfigError("Postgres.js 3.4.9 does not support channel_binding. Use a driver-compatible URL without that parameter; channel binding is not provided.");
  if (url.searchParams.has("ssl"))
    throw new DatabaseConfigError("Use sslmode=verify-full instead of an ssl URL parameter.");
  const mode = url.searchParams.get("sslmode");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (mode && !["require", "verify-ca", "verify-full", "disable"].includes(mode))
    throw new DatabaseConfigError("Use sslmode=verify-full for PostgreSQL TLS.");
  if (mode === "disable" && !loopback)
    throw new DatabaseConfigError("Unencrypted PostgreSQL is allowed only on loopback for local tests/development.");
  // In this driver, sslmode=require disables certificate checks. Upgrade it rather
  // than passing it through. Plaintext is explicit and loopback-only.
  const ssl = mode === "disable" ? false : { rejectUnauthorized: true };
  url.searchParams.delete("sslmode");
  return { url: url.toString(), ssl, prepare: false };
}

/** @param {Record<string, string | undefined>} env */
export function databaseMode(env) {
  if (env.DATABASE_MODE && !["postgres", "pglite"].includes(env.DATABASE_MODE))
    throw new DatabaseConfigError("DATABASE_MODE must be postgres or pglite.");
  if (env.DATABASE_MODE === "pglite") {
    if (env.DATABASE_URL?.trim())
      throw new DatabaseConfigError("PGlite mode requires DATABASE_URL to be empty. Refusing an ambiguous database selection.");
    if (env.VERCEL || env.RENDER)
      throw new DatabaseConfigError("PGlite is for explicit local development/tests, not hosted Vercel or Render deployments.");
    return "pglite";
  }
  if (!env.DATABASE_URL?.trim())
    throw new DatabaseConfigError("DATABASE_URL is required. For local development, explicitly set DATABASE_MODE=pglite and run npm run db:local.");
  return "postgres";
}
