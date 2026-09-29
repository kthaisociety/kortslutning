import { describe, expect, it } from "vitest";
import {
  escapeLikePattern,
  isValidSlug,
  MAX_TARGET_URL_LENGTH,
  normalizeSlug,
  parseSlugInput,
  parseTargetUrl,
} from "./validation";

describe("normalizeSlug", () => {
  it("trims and lowercases", () => {
    expect(normalizeSlug("  AI-Day ")).toBe("ai-day");
  });
});

describe("isValidSlug", () => {
  it.each(["a", "ab", "a-b", "apply", "2026", "x".repeat(64)])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(["", "-a", "a-", "A", "a_b", "a.b", "a b", "å", "x".repeat(65)])("rejects %j", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe("parseSlugInput", () => {
  it.each(["", "   "])("treats %j as 'generate a random slug'", (raw) => {
    expect(parseSlugInput(raw)).toEqual({ ok: true, value: null });
  });

  it("normalizes a custom slug", () => {
    expect(parseSlugInput(" AI-Day ")).toEqual({ ok: true, value: "ai-day" });
  });

  it.each(["-apply", "apply!", "x".repeat(65)])("rejects %j with an explanation", (raw) => {
    expect(parseSlugInput(raw)).toEqual({ ok: false, error: expect.stringContaining("lowercase letters") });
  });
});

describe("parseTargetUrl", () => {
  const shortUrl = "https://ktha.is";

  it("accepts and normalizes an https URL", () => {
    expect(parseTargetUrl("  https://Example.com/path?q=1  ", shortUrl)).toEqual({
      ok: true,
      value: "https://example.com/path?q=1",
    });
  });

  it("accepts http URLs", () => {
    expect(parseTargetUrl("http://example.com/", shortUrl)).toEqual({ ok: true, value: "http://example.com/" });
  });

  it("accepts other subdomains of the short domain", () => {
    expect(parseTargetUrl("https://app.ktha.is/x", shortUrl)).toEqual({ ok: true, value: "https://app.ktha.is/x" });
  });

  it("requires a value", () => {
    expect(parseTargetUrl("   ", shortUrl)).toEqual({ ok: false, error: "Enter the URL to redirect to." });
  });

  it.each(["example.com", "not a url", "https://"])("rejects %j as not a full URL", (raw) => {
    expect(parseTargetUrl(raw, shortUrl)).toEqual({ ok: false, error: "Enter a full URL, including https://." });
  });

  it.each(["javascript:alert(1)", "ftp://example.com/file", "data:text/html,hi", "mailto:a@kthais.com"])(
    "rejects the scheme of %j",
    (raw) => {
      expect(parseTargetUrl(raw, shortUrl)).toEqual({
        ok: false,
        error: "Only http:// and https:// URLs are allowed.",
      });
    },
  );

  it.each(["https://ktha.is/other", "https://KTHA.IS/other", "https://ktha.is./other", "http://ktha.is:8080/other"])(
    "rejects %j, which points back at the short domain",
    (raw) => {
      expect(parseTargetUrl(raw, shortUrl)).toEqual({ ok: false, error: "Links can't point to ktha.is itself." });
    },
  );

  it("compares hostnames without the port for local development", () => {
    expect(parseTargetUrl("http://short.localhost:3000/x", "http://short.localhost:3000")).toEqual({
      ok: false,
      error: "Links can't point to short.localhost itself.",
    });
  });

  it("accepts URLs of exactly the maximum length", () => {
    const url = "https://example.com/" + "a".repeat(MAX_TARGET_URL_LENGTH - 20);
    expect(url).toHaveLength(MAX_TARGET_URL_LENGTH);
    expect(parseTargetUrl(url, shortUrl)).toEqual({ ok: true, value: url });
  });

  it("rejects longer URLs", () => {
    const url = "https://example.com/" + "a".repeat(MAX_TARGET_URL_LENGTH - 19);
    expect(parseTargetUrl(url, shortUrl)).toEqual({ ok: false, error: "The URL can be at most 2048 characters." });
  });

  it("percent-encodes spaces so the Location header stays valid", () => {
    expect(parseTargetUrl("https://example.com/a b", shortUrl)).toEqual({
      ok: true,
      value: "https://example.com/a%20b",
    });
  });

  it("strips embedded newlines and tabs", () => {
    expect(parseTargetUrl("https://exa\nmple.com/pa\tth", shortUrl)).toEqual({
      ok: true,
      value: "https://example.com/path",
    });
  });
});

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("100%_off\\")).toBe("100\\%\\_off\\\\");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("apply-2026")).toBe("apply-2026");
  });
});
