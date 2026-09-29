import { z } from "zod";

const httpUrl = z.url({
  protocol: /^https?$/,
  error: "must be an http:// or https:// URL",
});

const envSchema = z.object({
  DB_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, { error: "must be at least 32 characters" }),
  APP_URL: httpUrl,
  SHORT_URL: httpUrl,
  ROOT_REDIRECT_URL: httpUrl,
});

export interface Env {
  dbUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  betterAuthSecret: string;
  /** Dashboard origin without trailing slash, e.g. "https://app.ktha.is". */
  appUrl: string;
  /** Dashboard host (with port, if any), lowercase, e.g. "app.ktha.is". */
  appHost: string;
  /** Short-link origin without trailing slash, e.g. "https://ktha.is". */
  shortUrl: string;
  /** Short-link host (with port, if any), lowercase, e.g. "ktha.is". */
  shortHost: string;
  rootRedirectUrl: string;
}

function configError(details: string[]): Error {
  return new Error(`Invalid environment configuration:\n${details.map((detail) => `  - ${detail}`).join("\n")}`);
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw configError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const values = result.data;
  const app = new URL(values.APP_URL);
  const short = new URL(values.SHORT_URL);
  if (app.host === short.host) {
    throw configError(["SHORT_URL: must use a different host than APP_URL"]);
  }
  return {
    dbUrl: values.DB_URL,
    googleClientId: values.GOOGLE_CLIENT_ID,
    googleClientSecret: values.GOOGLE_CLIENT_SECRET,
    betterAuthSecret: values.BETTER_AUTH_SECRET,
    appUrl: app.origin,
    appHost: app.host,
    shortUrl: short.origin,
    shortHost: short.host,
    rootRedirectUrl: new URL(values.ROOT_REDIRECT_URL).href,
  };
}

let cached: Env | undefined;

/**
 * The app's configuration, parsed from process.env on first use.
 * Never call this at module top level: `next build` runs without these variables.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
