import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@/lib/db";
import { links, user } from "@/lib/db/schema";
import { escapeLikePattern } from "./validation";

/** A link as shown in the dashboard. Author names are null when the user row no longer exists. */
export interface LinkRow {
  slug: string;
  targetUrl: string;
  clickCount: number;
  lastClickedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  updatedByName: string | null;
}

const creator = alias(user, "creator");
const updater = alias(user, "updater");

function selectLinkRows(db: Database) {
  return db
    .select({
      slug: links.slug,
      targetUrl: links.targetUrl,
      clickCount: links.clickCount,
      lastClickedAt: links.lastClickedAt,
      createdAt: links.createdAt,
      updatedAt: links.updatedAt,
      createdByName: creator.name,
      updatedByName: updater.name,
    })
    .from(links)
    .leftJoin(creator, eq(links.createdBy, creator.id))
    .leftJoin(updater, eq(links.updatedBy, updater.id));
}

/** Inserts a link. Returns false if the slug is already taken. */
export async function insertLink(
  db: Database,
  input: { slug: string; targetUrl: string; userId: string },
): Promise<boolean> {
  const rows = await db
    .insert(links)
    .values({ slug: input.slug, targetUrl: input.targetUrl, createdBy: input.userId, updatedBy: input.userId })
    .onConflictDoNothing({ target: links.slug })
    .returning({ slug: links.slug });
  return rows.length === 1;
}

/** Changes a link's destination. Returns false if the link does not exist. */
export async function updateLinkTarget(
  db: Database,
  input: { slug: string; targetUrl: string; userId: string },
): Promise<boolean> {
  const rows = await db
    .update(links)
    .set({ targetUrl: input.targetUrl, updatedBy: input.userId, updatedAt: sql`now()` })
    .where(eq(links.slug, input.slug))
    .returning({ slug: links.slug });
  return rows.length === 1;
}

/** Deletes a link. Returns false if it did not exist. */
export async function deleteLink(db: Database, slug: string): Promise<boolean> {
  const rows = await db.delete(links).where(eq(links.slug, slug)).returning({ slug: links.slug });
  return rows.length === 1;
}

export async function getLink(db: Database, slug: string): Promise<LinkRow | null> {
  const [row] = await selectLinkRows(db).where(eq(links.slug, slug));
  return row ?? null;
}

/** All links, newest first. `query` matches the slug or target case-insensitively and literally. */
export async function listLinks(db: Database, options: { query?: string } = {}): Promise<LinkRow[]> {
  const query = options.query?.trim();
  const pattern = query ? `%${escapeLikePattern(query)}%` : undefined;
  return selectLinkRows(db)
    .where(pattern ? or(ilike(links.slug, pattern), ilike(links.targetUrl, pattern)) : undefined)
    .orderBy(desc(links.createdAt), links.slug);
}

/** Looks up a link for a visitor and counts the click, in one atomic statement. */
export async function resolveLink(db: Database, slug: string): Promise<string | null> {
  const [row] = await db
    .update(links)
    .set({ clickCount: sql`${links.clickCount} + 1`, lastClickedAt: sql`now()` })
    .where(eq(links.slug, slug))
    .returning({ targetUrl: links.targetUrl });
  return row?.targetUrl ?? null;
}
