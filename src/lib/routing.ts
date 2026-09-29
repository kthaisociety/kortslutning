export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; location: string }
  | { type: "rewrite"; pathname: string }
  | { type: "notFound" };

export interface RoutingConfig {
  /** Short-link hosts (with port, if any), lowercase, e.g. ["ktha.is", "www.ktha.is"]. */
  shortHosts: string[];
  rootRedirectUrl: string;
}

/** Internal page that resolves slugs (src/app/r/[slug]/page.tsx). Only reachable via the short host. */
const REDIRECT_ROUTE = "/r";
const SINGLE_SEGMENT = /^\/([^/]+)$/;

/**
 * Decides what to do with a request based on its Host header and path.
 * - Short hosts (ktha.is and its www. alias): "/" → redirect to the main site; "/<slug>" → the redirect page; "/<file.ext>" → static file; else 404.
 * - Any other host is the dashboard; the internal redirect route is hidden there.
 */
export function routeRequest(host: string | null, pathname: string, config: RoutingConfig): RouteDecision {
  if (host && config.shortHosts.includes(host.toLowerCase())) {
    if (pathname === "/") return { type: "redirect", location: config.rootRedirectUrl };
    const match = SINGLE_SEGMENT.exec(pathname);
    if (!match) return { type: "notFound" };
    const segment = match[1];
    // Slugs never contain dots, so "/favicon.ico" and friends are files, not slugs.
    return segment.includes(".") ? { type: "next" } : { type: "rewrite", pathname: `${REDIRECT_ROUTE}/${segment}` };
  }

  if (pathname === REDIRECT_ROUTE || pathname.startsWith(`${REDIRECT_ROUTE}/`)) return { type: "notFound" };
  return { type: "next" };
}
