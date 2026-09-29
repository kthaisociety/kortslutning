import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { links } from "@/lib/db/schema";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { deleteLink, getLink, insertLink, listLinks, resolveLink, updateLinkTarget } from "./repository";

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

async function seed(slug: string, targetUrl = `https://example.com/${slug}`) {
  const author = await createTestUser(db);
  expect(await insertLink(db, { slug, targetUrl, userId: author.id })).toBe(true);
  return author;
}

describe("insertLink and getLink", () => {
  it("inserts a link and reads it back with the author's name", async () => {
    const author = await createTestUser(db, { name: "Ada Lovelace" });
    expect(await insertLink(db, { slug: "apply", targetUrl: "https://example.com/apply", userId: author.id })).toBe(
      true,
    );
    expect(await getLink(db, "apply")).toMatchObject({
      slug: "apply",
      targetUrl: "https://example.com/apply",
      clickCount: 0,
      lastClickedAt: null,
      createdByName: "Ada Lovelace",
      updatedByName: "Ada Lovelace",
    });
  });

  it("returns false for a taken slug and keeps the original target", async () => {
    const author = await seed("apply", "https://example.com/original");
    expect(await insertLink(db, { slug: "apply", targetUrl: "https://example.com/other", userId: author.id })).toBe(
      false,
    );
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/original" });
  });

  it("returns null for an unknown slug", async () => {
    expect(await getLink(db, "missing")).toBeNull();
  });
});

describe("updateLinkTarget", () => {
  it("changes the target and records who changed it", async () => {
    const author = await createTestUser(db, { name: "Ada" });
    const editor = await createTestUser(db, { name: "Grace" });
    await insertLink(db, { slug: "apply", targetUrl: "https://example.com/old", userId: author.id });
    const longAgo = new Date("2020-01-01T00:00:00Z");
    await db.update(links).set({ updatedAt: longAgo });

    expect(await updateLinkTarget(db, { slug: "apply", targetUrl: "https://example.com/new", userId: editor.id })).toBe(
      true,
    );

    const link = await getLink(db, "apply");
    expect(link).toMatchObject({ targetUrl: "https://example.com/new", createdByName: "Ada", updatedByName: "Grace" });
    expect(link!.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("returns false when the link does not exist", async () => {
    const editor = await createTestUser(db);
    expect(await updateLinkTarget(db, { slug: "missing", targetUrl: "https://example.com/", userId: editor.id })).toBe(
      false,
    );
  });
});

describe("deleteLink", () => {
  it("deletes an existing link once", async () => {
    await seed("apply");
    expect(await deleteLink(db, "apply")).toBe(true);
    expect(await getLink(db, "apply")).toBeNull();
    expect(await deleteLink(db, "apply")).toBe(false);
  });
});

describe("listLinks", () => {
  it("lists links newest first", async () => {
    await seed("first");
    await seed("second");
    expect((await listLinks(db)).map((link) => link.slug)).toEqual(["second", "first"]);
  });

  it("searches slug and target case-insensitively", async () => {
    await seed("apply", "https://forms.example.com/join");
    await seed("slides", "https://docs.example.com/deck");
    expect((await listLinks(db, { query: "APP" })).map((link) => link.slug)).toEqual(["apply"]);
    expect((await listLinks(db, { query: "DECK" })).map((link) => link.slug)).toEqual(["slides"]);
    expect(await listLinks(db, { query: "   " })).toHaveLength(2);
  });

  it("matches %, _ and \\ literally instead of as wildcards", async () => {
    await seed("sale", "https://example.com/?code=100%_off");
    await seed("plain", "https://example.com/plain");
    expect((await listLinks(db, { query: "%" })).map((link) => link.slug)).toEqual(["sale"]);
    expect((await listLinks(db, { query: "_" })).map((link) => link.slug)).toEqual(["sale"]);
    expect(await listLinks(db, { query: "\\" })).toEqual([]);
  });
});

describe("resolveLink", () => {
  it("returns the target and counts each click", async () => {
    await seed("apply", "https://example.com/apply");
    expect(await resolveLink(db, "apply")).toBe("https://example.com/apply");
    expect(await resolveLink(db, "apply")).toBe("https://example.com/apply");
    const link = await getLink(db, "apply");
    expect(link).toMatchObject({ clickCount: 2 });
    expect(link!.lastClickedAt).toBeInstanceOf(Date);
  });

  it("returns null for unknown slugs without creating rows", async () => {
    expect(await resolveLink(db, "missing")).toBeNull();
    expect(await listLinks(db)).toEqual([]);
  });

  it("counts concurrent clicks exactly", async () => {
    await seed("apply");
    await Promise.all(Array.from({ length: 25 }, () => resolveLink(db, "apply")));
    expect((await getLink(db, "apply"))!.clickCount).toBe(25);
  });
});
