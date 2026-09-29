import { describe, expect, it } from "vitest";
import { routeRequest, type RoutingConfig } from "./routing";

const config: RoutingConfig = { shortHosts: ["ktha.is", "www.ktha.is"], rootRedirectUrl: "https://kthais.com/" };

describe("routeRequest on the short host", () => {
  it("redirects the root to ROOT_REDIRECT_URL", () => {
    expect(routeRequest("ktha.is", "/", config)).toEqual({ type: "redirect", location: "https://kthais.com/" });
  });

  it("rewrites a single segment to the redirect route", () => {
    expect(routeRequest("ktha.is", "/apply", config)).toEqual({ type: "rewrite", pathname: "/r/apply" });
  });

  it("passes the segment's case through; the redirect page normalizes it", () => {
    expect(routeRequest("ktha.is", "/Apply", config)).toEqual({ type: "rewrite", pathname: "/r/Apply" });
  });

  it("matches the Host header case-insensitively", () => {
    expect(routeRequest("KTHA.IS", "/apply", config)).toEqual({ type: "rewrite", pathname: "/r/apply" });
  });

  it("treats the www alias exactly like the short host", () => {
    expect(routeRequest("www.ktha.is", "/apply", config)).toEqual({ type: "rewrite", pathname: "/r/apply" });
    expect(routeRequest("WWW.KTHA.IS", "/", config)).toEqual({ type: "redirect", location: "https://kthais.com/" });
    expect(routeRequest("www.ktha.is", "/a/b", config)).toEqual({ type: "notFound" });
  });

  it("treats slugs that look like app routes as slugs", () => {
    expect(routeRequest("ktha.is", "/login", config)).toEqual({ type: "rewrite", pathname: "/r/login" });
  });

  it.each(["/favicon.ico", "/robots.txt", "/kthais-logo.svg", "/icon.svg"])("serves the file %s", (path) => {
    expect(routeRequest("ktha.is", path, config)).toEqual({ type: "next" });
  });

  it.each(["/a/b", "/r/apply", "/api/auth/get-session", "/links/apply", "/a/b.png"])("hides %s", (path) => {
    expect(routeRequest("ktha.is", path, config)).toEqual({ type: "notFound" });
  });
});

describe("routeRequest on any other host", () => {
  it.each(["/", "/login", "/links/apply", "/api/auth/get-session", "/robots.txt"])("passes %s through", (path) => {
    expect(routeRequest("app.ktha.is", path, config)).toEqual({ type: "next" });
  });

  it.each(["/r", "/r/apply"])("hides the internal route %s", (path) => {
    expect(routeRequest("app.ktha.is", path, config)).toEqual({ type: "notFound" });
  });

  it("does not treat other subdomains as short hosts", () => {
    expect(routeRequest("www.app.ktha.is", "/apply", config)).toEqual({ type: "next" });
  });

  it("treats a missing Host header as the app host", () => {
    expect(routeRequest(null, "/apply", config)).toEqual({ type: "next" });
  });

  it("compares hosts including the port", () => {
    const local: RoutingConfig = { shortHosts: ["short.localhost:3000"], rootRedirectUrl: "https://kthais.com/" };
    expect(routeRequest("short.localhost:3000", "/apply", local)).toEqual({ type: "rewrite", pathname: "/r/apply" });
    expect(routeRequest("localhost:3000", "/apply", local)).toEqual({ type: "next" });
  });
});
