import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseMode, postgresConfig } from "./config.mjs";

type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const g = globalThis as unknown as { __db?: DB };

function create(): DB {
  if (databaseMode(process.env) === "postgres") {
    const { url, ...options } = postgresConfig(process.env.DATABASE_URL);
    // prepare:false keeps it compatible with transaction poolers (Supabase, Neon, PgBouncer)
    return drizzlePg(postgres(url, { ...options, max: 5 }), { schema });
  }
  // Explicit local mode only; no production fallback when a secret is missing.
  const client = new PGlite(process.env.PGLITE_DIR || ".data/pglite");
  return drizzlePglite(client, { schema }) as unknown as DB;
}

// Lazy so that importing this module (e.g. during `next build`) never opens a connection.
export const db = new Proxy({} as DB, {
  get(_, prop) {
    g.__db ??= create();
    const value = Reflect.get(g.__db, prop);
    return typeof value === "function" ? value.bind(g.__db) : value;
  },
});

export { schema };
