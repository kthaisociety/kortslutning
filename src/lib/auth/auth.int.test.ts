import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { session } from "@/lib/db/schema";
import { parseEnv } from "@/lib/env";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { createAuth } from "./auth";

const env = parseEnv({
  DB_URL: "unused-the-test-db-is-injected",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
  SHORT_URL: "http://short.localhost:3000",
  ROOT_REDIRECT_URL: "https://kthais.com",
});
const { db, pool } = createTestDb();
const auth = createAuth(db, env);
const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

/** Inserts a session directly and returns the signed cookie Better Auth expects. */
async function seedSession(expiresAt: Date) {
  const user = await createTestUser(db);
  const token = randomBytes(24).toString("base64url");
  await db.insert(session).values({ id: `session-${token}`, token, userId: user.id, expiresAt, updatedAt: new Date() });
  const signature = createHmac("sha256", env.betterAuthSecret).update(token).digest("base64");
  return { token, cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}` };
}

describe("sessions", () => {
  it("are not extended by use, so a removed member is signed out within 7 days of signing in", async () => {
    // Signed in six days ago. With rolling refresh, using it now would push expiry 7 days out again.
    const expiresAt = new Date(Date.now() + DAY);
    const { token, cookie } = await seedSession(expiresAt);

    const result = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(result?.user.email).toMatch(/@kthais\.com$/);

    const [row] = await db.select().from(session).where(eq(session.token, token));
    expect(Math.abs(row.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(1000);
  });

  it("stop working once they expire", async () => {
    const { cookie } = await seedSession(new Date(Date.now() - 1000));
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });
});
