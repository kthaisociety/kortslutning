import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { isAllowedEmail } from "./domain";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** The signed-in @kthais.com user, or null. Deduplicated within a request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Read headers before touching getAuth(): it marks the route dynamic, so `next build` (which has no env)
  // never prerenders pages that call this.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  const user = session?.user;
  if (!user || !isAllowedEmail(user.email, user.emailVerified)) return null;
  return { id: user.id, name: user.name, email: user.email, image: user.image ?? null };
});

/** Call first in every page, server action and route handler that needs a user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
