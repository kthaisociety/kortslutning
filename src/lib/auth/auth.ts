import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "./domain";

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.appUrl,
    secret: env.betterAuthSecret,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    socialProviders: {
      google: {
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret,
        // Sent to Google as a hint, and enforced against the ID token's `hd` claim.
        hd: ALLOWED_EMAIL_DOMAIN,
        prompt: "select_account",
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Second, independent check: no user row (and so no session) for anyone else.
          before: async (user) => {
            if (!isAllowedEmail(user.email, user.emailVerified)) return false;
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let auth: Auth | undefined;

/** Created on first use: `next build` runs without the environment variables it needs. */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
