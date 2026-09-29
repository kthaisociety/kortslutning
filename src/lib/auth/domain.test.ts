import { describe, expect, it } from "vitest";
import { DOMAIN_ERROR_MESSAGE, isAllowedEmail } from "./domain";

describe("isAllowedEmail", () => {
  it.each(["member@kthais.com", "Member@KTHAIS.COM", "first.last+tag@kthais.com"])("allows verified %s", (email) => {
    expect(isAllowedEmail(email, true)).toBe(true);
  });

  it("rejects unverified addresses", () => {
    expect(isAllowedEmail("member@kthais.com", false)).toBe(false);
    expect(isAllowedEmail("member@kthais.com", undefined)).toBe(false);
    expect(isAllowedEmail("member@kthais.com", null)).toBe(false);
  });

  it.each([
    "member@gmail.com",
    "member@evil-kthais.com",
    "member@kthais.com.evil.io",
    "member@sub.kthais.com",
    "member@kthais.co",
    "member@kthais.com@evil.io",
    "kthais.com",
    "@kthais.com",
    "",
  ])("rejects %j", (email) => {
    expect(isAllowedEmail(email, true)).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isAllowedEmail(null, true)).toBe(false);
    expect(isAllowedEmail(undefined, true)).toBe(false);
  });
});

describe("DOMAIN_ERROR_MESSAGE", () => {
  it("matches the spec's copy", () => {
    expect(DOMAIN_ERROR_MESSAGE).toBe("Only @kthais.com accounts can sign in.");
  });
});
