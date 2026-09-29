import { runMigrations } from "../lib/db/migrate";
import { createTestDb } from "./db";

export default async function setup() {
  const { db, pool } = createTestDb();
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
