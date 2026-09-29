import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DB_URL: "postgres://user:pass@localhost:5432/kortslutning",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  BETTER_AUTH_SECRET: "x".repeat(32),
  APP_URL: "https://app.ktha.is",
  SHORT_URL: "https://ktha.is",
  ROOT_REDIRECT_URL: "https://kthais.com",
};

describe("parseEnv", () => {
  it("parses a valid environment and derives hosts", () => {
    expect(parseEnv(valid)).toEqual({
      dbUrl: valid.DB_URL,
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
      betterAuthSecret: "x".repeat(32),
      appUrl: "https://app.ktha.is",
      appHost: "app.ktha.is",
      shortUrl: "https://ktha.is",
      shortHost: "ktha.is",
      shortHostAliases: ["www.ktha.is"],
      rootRedirectUrl: "https://kthais.com/",
    });
  });

  it("derives the www alias of the short host, keeping the port", () => {
    const env = parseEnv({ ...valid, APP_URL: "http://localhost:3000", SHORT_URL: "http://short.localhost:3000" });
    expect(env.shortHostAliases).toEqual(["www.short.localhost:3000"]);
  });

  it("rejects APP_URL on the www form of SHORT_URL, which is always a short-link alias", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "https://www.ktha.is" })).toThrow(
      /APP_URL: must not be www\.ktha\.is, the www alias of SHORT_URL/,
    );
  });

  it("normalizes URLs to lowercase origins without trailing slashes", () => {
    const env = parseEnv({ ...valid, APP_URL: "https://App.Ktha.is/", SHORT_URL: "https://KTHA.IS/" });
    expect(env.appUrl).toBe("https://app.ktha.is");
    expect(env.shortUrl).toBe("https://ktha.is");
    expect(env.shortHost).toBe("ktha.is");
  });

  it("keeps ports in hosts for local development", () => {
    const env = parseEnv({ ...valid, APP_URL: "http://localhost:3000", SHORT_URL: "http://short.localhost:3000" });
    expect(env.appHost).toBe("localhost:3000");
    expect(env.shortHost).toBe("short.localhost:3000");
    expect(env.shortUrl).toBe("http://short.localhost:3000");
  });

  it.each(Object.keys(valid))("names %s when it is missing", (name) => {
    expect(() => parseEnv({ ...valid, [name]: undefined })).toThrow(name);
  });

  it("rejects non-http URLs", () => {
    expect(() => parseEnv({ ...valid, ROOT_REDIRECT_URL: "ftp://kthais.com" })).toThrow(
      /ROOT_REDIRECT_URL: must be an http/,
    );
  });

  it("rejects a short BETTER_AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "too-short" })).toThrow(
      /BETTER_AUTH_SECRET: must be at least 32 characters/,
    );
  });

  it("rejects APP_URL and SHORT_URL on the same host", () => {
    expect(() => parseEnv({ ...valid, SHORT_URL: "https://app.ktha.is" })).toThrow(
      /SHORT_URL: must use a different host than APP_URL/,
    );
  });
});
