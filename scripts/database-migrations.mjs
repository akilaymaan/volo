import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { DatabaseConfigError, postgresConfig } from "../src/lib/db/config.mjs";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
// Stable application namespace; session-scoped lock requires a direct connection.
export const MIGRATION_LOCK = [867656, 1];

/** @param {string | undefined} raw */
export async function migratePostgresDatabase(raw) {
  const { url, ...options } = postgresConfig(raw);
  if (new URL(url).hostname.includes("-pooler."))
    throw new DatabaseConfigError("Migrations require a direct Neon connection, not its pooled endpoint. Supply the direct URL as DATABASE_URL for this process only.");
  // One non-recycled physical connection holds the lock through Drizzle's transaction.
  const client = postgres(url, {
    ...options, max: 1, max_lifetime: 0, idle_timeout: 0, connect_timeout: 10,
    onnotice: () => {},
  });
  let locked = false;
  let disconnected = false;
  client.options.onclose = () => {
    disconnected = true;
    // Losing the physical connection loses the lock. Never reconnect and continue.
    if (locked) void client.end({ timeout: 0 }).catch(() => {});
  };
  try {
    const [lock] = await client`select pg_try_advisory_lock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]}) as locked`;
    locked = lock.locked;
    if (!locked) throw new DatabaseConfigError("Another Volo migration is running. Wait for it to finish and retry.");
    if (disconnected) throw new DatabaseConfigError("Migration connection closed before migration began. Retry with a direct connection.");
    await migratePostgres(drizzle(client), { migrationsFolder });
    if (disconnected) throw new DatabaseConfigError("Migration connection was interrupted. Verify the migration journal before retrying.");
  } finally {
    try {
      if (locked && !disconnected)
        await client`select pg_advisory_unlock(${MIGRATION_LOCK[0]}, ${MIGRATION_LOCK[1]})`;
    } finally { await client.end({ timeout: 5 }); }
  }
}

/** @param {Record<string, string | undefined>} env */
export async function migrateLocalDatabase(env) {
  if (env.DATABASE_URL?.trim())
    throw new DatabaseConfigError("Local migrations require DATABASE_URL to be empty. PostgreSQL was not touched.");
  if (env.DATABASE_MODE !== "pglite" || env.VERCEL || env.RENDER)
    throw new DatabaseConfigError("Local migrations require DATABASE_MODE=pglite outside hosted environments.");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: localDrizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(env.PGLITE_DIR || ".data/pglite");
  try { await migrate(localDrizzle(client), { migrationsFolder }); }
  finally { await client.close(); }
}
