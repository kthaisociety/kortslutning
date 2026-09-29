import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { getLink, listLinks } from "./repository";
import {
  createLink,
  LINK_GONE_MESSAGE,
  MAX_RANDOM_SLUG_ATTEMPTS,
  RANDOM_SLUG_EXHAUSTED_MESSAGE,
  removeLink,
  updateLink,
} from "./service";

const SHORT_URL = "https://ktha.is";
const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

describe("createLink", () => {
  it("creates a link with a normalized custom slug and target", async () => {
    const user = await createTestUser(db);
    expect(
      await createLink(db, {
        userId: user.id,
        slug: "  AI-Day ",
        targetUrl: " https://Example.com/ai-day ",
        shortUrl: SHORT_URL,
      }),
    ).toEqual({ ok: true, slug: "ai-day" });
    expect(await getLink(db, "ai-day")).toMatchObject({ targetUrl: "https://example.com/ai-day" });
  });

  it("reports errors for both fields at once and stores nothing", async () => {
    const user = await createTestUser(db);
    expect(
      await createLink(db, { userId: user.id, slug: "-bad-", targetUrl: "ftp://example.com", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, fieldErrors: { slug: expect.any(String), targetUrl: expect.any(String) } });
    expect(await listLinks(db)).toEqual([]);
  });

  it("reports a taken slug using the short host", async () => {
    const user = await createTestUser(db);
    const input = { userId: user.id, slug: "apply", targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    expect(await createLink(db, input)).toEqual({ ok: true, slug: "apply" });
    expect(await createLink(db, input)).toEqual({
      ok: false,
      fieldErrors: { slug: "ktha.is/apply is already taken." },
    });
  });

  it("generates a random slug when the slug is blank", async () => {
    const user = await createTestUser(db);
    const result = await createLink(db, {
      userId: user.id,
      slug: "   ",
      targetUrl: "https://example.com/",
      shortUrl: SHORT_URL,
    });
    expect(result).toEqual({ ok: true, slug: expect.stringMatching(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/) });
    if (!result.ok) throw new Error("expected success");
    expect(await getLink(db, result.slug)).not.toBeNull();
  });

  it("retries when a random slug is already taken", async () => {
    const user = await createTestUser(db);
    const base = { userId: user.id, targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    await createLink(db, { ...base, slug: "taken1" });
    const candidates = ["taken1", "fresh1"];
    const generateSlug = vi.fn(() => candidates.shift() ?? "unused");

    expect(await createLink(db, { ...base, slug: "", generateSlug })).toEqual({ ok: true, slug: "fresh1" });
    expect(generateSlug).toHaveBeenCalledTimes(2);
  });

  it(`gives up after ${MAX_RANDOM_SLUG_ATTEMPTS} taken random slugs`, async () => {
    const user = await createTestUser(db);
    const base = { userId: user.id, targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    await createLink(db, { ...base, slug: "taken1" });
    const generateSlug = vi.fn(() => "taken1");

    expect(await createLink(db, { ...base, slug: "", generateSlug })).toEqual({
      ok: false,
      message: RANDOM_SLUG_EXHAUSTED_MESSAGE,
    });
    expect(generateSlug).toHaveBeenCalledTimes(MAX_RANDOM_SLUG_ATTEMPTS);
  });
});

describe("updateLink", () => {
  it("updates the target and accepts a mixed-case slug", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/old", shortUrl: SHORT_URL });
    expect(
      await updateLink(db, { userId: user.id, slug: "Apply", targetUrl: "https://example.com/new", shortUrl: SHORT_URL }),
    ).toEqual({ ok: true });
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/new" });
  });

  it("rejects an invalid target and leaves the link unchanged", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/old", shortUrl: SHORT_URL });
    expect(
      await updateLink(db, { userId: user.id, slug: "apply", targetUrl: "https://ktha.is/loop", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, fieldErrors: { targetUrl: "Links can't point to ktha.is itself." } });
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/old" });
  });

  it("reports a link that no longer exists", async () => {
    const user = await createTestUser(db);
    expect(
      await updateLink(db, { userId: user.id, slug: "gone", targetUrl: "https://example.com/", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, message: LINK_GONE_MESSAGE });
  });
});

describe("removeLink", () => {
  it("deletes once, then reports the link as gone", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/", shortUrl: SHORT_URL });
    expect(await removeLink(db, "APPLY")).toEqual({ ok: true });
    expect(await removeLink(db, "apply")).toEqual({ ok: false, message: LINK_GONE_MESSAGE });
  });
});
