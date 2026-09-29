import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { links } from "./schema";

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

describe("links table", () => {
  it("stores a link with defaults", async () => {
    const author = await createTestUser(db);
    await db.insert(links).values({
      slug: "apply",
      targetUrl: "https://example.com/",
      createdBy: author.id,
      updatedBy: author.id,
    });
    const [row] = await db.select().from(links);
    expect(row).toMatchObject({ slug: "apply", clickCount: 0, lastClickedAt: null, createdBy: author.id });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it.each(["-apply", "apply-", "Apply", "a_b", "a.b", "", "x".repeat(65)])(
    "rejects the invalid slug %j with the check constraint",
    async (slug) => {
      await expect(db.insert(links).values({ slug, targetUrl: "https://example.com/" }).execute()).rejects.toMatchObject(
        { cause: { code: "23514" } },
      );
    },
  );

  it("keeps links when their author is deleted", async () => {
    const author = await createTestUser(db);
    await db.insert(links).values({
      slug: "keep",
      targetUrl: "https://example.com/",
      createdBy: author.id,
      updatedBy: author.id,
    });
    await db.execute(sql`DELETE FROM "user" WHERE id = ${author.id}`);
    const [row] = await db.select().from(links);
    expect(row).toMatchObject({ slug: "keep", createdBy: null, updatedBy: null });
  });
});
