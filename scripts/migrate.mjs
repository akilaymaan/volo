// Explicit migration entry point. Build/start/dev never execute this script.
import nextEnv from "@next/env";
import { DatabaseConfigError } from "../src/lib/db/config.mjs";
import { migrateLocalDatabase, migratePostgresDatabase } from "./database-migrations.mjs";

nextEnv.loadEnvConfig(process.cwd()); // same .env / .env.local resolution as Next

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--local"))
    throw new DatabaseConfigError("Usage: npm run db (PostgreSQL) or npm run db:local (explicit PGlite).");
  if (args[0] === "--local") {
    await migrateLocalDatabase(process.env);
    console.log("Local PGlite migrations applied.");
  } else {
    await migratePostgresDatabase(process.env.DATABASE_URL);
    console.log("PostgreSQL migrations applied.");
  }
} catch (error) {
  // Driver errors may contain connection details. Do not print their message/stack.
  console.error(error instanceof DatabaseConfigError ? error.message : "Database migration failed. Check connectivity, TLS, database permissions and migration SQL. Connection details were not logged.");
  process.exitCode = 1;
}
