import { describe, expect, it } from "vitest";
import { shortLinkLabel, shortLinkUrl } from "./short-url";

describe("shortLinkUrl", () => {
  it("joins the short origin and slug", () => {
    expect(shortLinkUrl("https://ktha.is", "apply")).toBe("https://ktha.is/apply");
    expect(shortLinkUrl("https://ktha.is/", "apply")).toBe("https://ktha.is/apply");
  });
});

describe("shortLinkLabel", () => {
  it("drops the scheme", () => {
    expect(shortLinkLabel("https://ktha.is", "apply")).toBe("ktha.is/apply");
  });

  it("keeps the port for local development", () => {
    expect(shortLinkLabel("http://short.localhost:3000", "x")).toBe("short.localhost:3000/x");
  });
});
