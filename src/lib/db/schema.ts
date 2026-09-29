import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

export const links = pgTable(
  "links",
  {
    slug: text("slug").primaryKey(),
    targetUrl: text("target_url").notNull(),
    clickCount: integer("click_count").notNull().default(0),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Same rule as SLUG_PATTERN in src/lib/links/validation.ts.
    check("links_slug_format", sql`${table.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`),
    index("links_created_at_idx").on(table.createdAt),
  ],
);
