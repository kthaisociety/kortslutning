import { sql } from "drizzle-orm";
import { createDb, type Database } from "../lib/db";
import { user } from "../lib/db/schema";

function testDbUrl(): string {
  const url = process.env.TEST_DB_URL;
  if (!url) {
    throw new Error(
      "TEST_DB_URL is not set. Run `docker compose up -d db` and `cp .env.example .env` (see README).",
    );
  }
  return url;
}

export function createTestDb() {
  return createDb(testDbUrl());
}

/** Empties all tables. Truncating "user" cascades to session, account and links. */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE links, "user" CASCADE`);
}

let userCounter = 0;

export async function createTestUser(db: Database, overrides: Partial<typeof user.$inferInsert> = {}) {
  userCounter += 1;
  const unique = `${userCounter}-${Date.now()}`;
  const [row] = await db
    .insert(user)
    .values({
      id: `test-user-${unique}`,
      name: `Test User ${userCounter}`,
      email: `test-${unique}@kthais.com`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row;
}
