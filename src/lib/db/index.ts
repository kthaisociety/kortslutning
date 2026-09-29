import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle({ client: pool, schema }), pool };
}

// Cached on globalThis so `next dev` hot reloads reuse one connection pool.
const globalForDb = globalThis as typeof globalThis & { kortslutningDb?: Database };

/** The app's shared database handle, created on first use. */
export function getDb(): Database {
  globalForDb.kortslutningDb ??= createDb(getEnv().dbUrl).db;
  return globalForDb.kortslutningDb;
}
