import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { routeRequest } from "@/lib/routing";

/** A path with no route: rewriting here renders src/app/not-found.tsx with status 404. */
const NOT_FOUND_PATH = "/__not-found";

export function proxy(request: NextRequest) {
  const env = getEnv();
  const decision = routeRequest(request.headers.get("host"), request.nextUrl.pathname, {
    shortHost: env.shortHost,
    rootRedirectUrl: env.rootRedirectUrl,
  });

  switch (decision.type) {
    case "redirect":
      return NextResponse.redirect(decision.location, 307);
    case "rewrite":
    case "notFound": {
      // Next.js serves a rewrite internally only when its origin matches the server's own origin.
      // That holds with HOSTNAME=0.0.0.0 (Dockerfile default) but not with a loopback IP (see README).
      const url = request.nextUrl.clone();
      url.pathname = decision.type === "rewrite" ? decision.pathname : NOT_FOUND_PATH;
      return NextResponse.rewrite(url);
    }
    case "next":
      return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
