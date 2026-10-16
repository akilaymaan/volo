// Applies SQL migrations in ./drizzle to DATABASE_URL, or to the local embedded database.
// Runs before `dev`, `build` and `start`, so a fresh clone needs no manual DB step.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd()); // same .env / .env.local resolution as Next

const url = process.env.DATABASE_URL;
const migrationsFolder = "drizzle";

if (url) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder });
  await sql.end();
  console.log("✓ database migrated (DATABASE_URL)");
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR || ".data/pglite";
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
  console.log(`✓ database migrated (embedded Postgres at ${dir})`);
}
