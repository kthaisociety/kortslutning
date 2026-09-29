# ktha.is URL Shortener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app that serves public redirects on `ktha.is/<slug>` and a Google-SSO-protected dashboard on `app.ktha.is` where any `@kthais.com` member can create, edit, delete and QR-code short links.

**Architecture:** One Next.js 16 App Router app in one container. `src/proxy.ts` routes by `Host` header: short-host requests are rewritten to an internal `/r/[slug]` page that atomically resolves the slug, counts the click and returns a 307; every other host serves the dashboard. Better Auth (Google provider, `hd` restriction plus a user-creation hook) stores sessions in PostgreSQL via Drizzle ORM; migrations run at server start from `instrumentation.ts`.

**Tech Stack:** Next.js 16.3.7, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui 4.21 (Base UI), Better Auth 1.7.6, Drizzle ORM 0.45.3 + drizzle-kit 0.31.11, node-postgres 8.23, zod 4.6, qrcode 1.5.4, Vitest 5.0.2, PostgreSQL 18, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-29-url-shortener-design.md`

## Global Constraints

- Runtime is Node.js 22 (the existing `Dockerfile` uses `node:22-alpine`); use `@types/node@^22` (Vitest 5 rejects `^20`).
- Pin versions exactly as listed: `create-next-app@16.3.7`, `better-auth@1.7.6`, `drizzle-orm@0.45.3`, `drizzle-kit@0.31.11`, `pg@8.23.0`, `zod@4.6.5`, `qrcode@1.5.4`, `vitest@5.0.2`, `shadcn@4.21.0`. TypeScript stays on 5.x (do not upgrade to 7).
- npm only; exactly one lockfile (`package-lock.json`). The existing `Dockerfile` runs `npm ci`.
- Next.js 16 conventions: `src/proxy.ts` (not `middleware.ts`); `params`/`searchParams` are Promises; `error.tsx` receives `retry` (not `reset`). Before using any Next.js API not shown in this plan, read the matching guide in `node_modules/next/dist/docs/` (the generated `AGENTS.md` requires this).
- Never read environment variables at module top level. Use `getEnv()`, `getDb()` and `getAuth()`, which initialize lazily. The Docker build (`npm run build`) runs with no environment variables.
- Environment variable names, exactly: `DB_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `APP_URL`, `SHORT_URL`, `ROOT_REDIRECT_URL`. Tests also read `TEST_DB_URL`.
- Allowed sign-in domain: the code constant `ALLOWED_EMAIL_DOMAIN = "kthais.com"`.
- Slug rule: `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`, stored lowercase, immutable after creation. Random slugs: 6 characters from `23456789abcdefghjkmnpqrstuvwxyz`, at most 5 attempts.
- Redirects are HTTP 307. Targets must be `http:`/`https:`, at most 2048 characters, and must not point at the short domain's hostname.
- User-facing copy, exactly: `Only @kthais.com accounts can sign in.`, `<short host>/<slug> is already taken.` (e.g. `ktha.is/apply is already taken.`), `This link no longer exists.`
- `HOSTNAME` must be `0.0.0.0` (the Dockerfile default) or unset. A loopback value such as `127.0.0.1` makes Next.js proxy the rewrites externally, and every slug then returns 404 (verified during planning).
- Every page, server action and route handler that needs a user calls `requireUser()` first.
- Commits: conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`), and every message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- Do not push or open PRs without asking the user first.

## Review Focus

1. **Loopback `HOSTNAME` or any other rewrite-origin mismatch.** In the real standalone server, `ktha.is/<slug>` must return 307, not 404. Unit tests of `routeRequest` cannot see this. Pinned by the smoke test in Task 12, which also runs once with `SMOKE_HOSTNAME=127.0.0.1` to show that it catches the failure.
2. **Building with no environment variables**, as the Docker build does. `npm run build` must succeed even though `getEnv()` would throw. Pinned by the build-without-`.env` step in Task 8 and the env-less CI build in Task 13.
3. **Search text containing `%`, `_` or `\`.** It must match literally, not as a LIKE wildcard. Pinned by the literal-match test in Task 5.
4. **Case variants of the host and slug** (`KTHA.IS`, `/Apply`, `/APPLY`). They must behave exactly like lowercase. Pinned by the uppercase-host test in Task 7, the mixed-case update test in Task 6 and the uppercase-slug smoke check in Task 12.
5. **Destination URLs that loop back to the short domain or carry whitespace or control characters** (`https://KTHA.IS./x`, `http://ktha.is:8080/x`, `https://example.com/a b`, an embedded newline). They must be rejected or normalized so the `Location` header is always valid. Pinned by the `parseTargetUrl` tests in Task 3.

---

## File Structure

```
.dockerignore                         Keeps node_modules, .next, .git, .env* out of the Docker build context (Task 12)
.env.example                          Every variable with local defaults (Task 4)
.github/workflows/ci.yml              Lint, typecheck, test, env-less build, smoke, docker build (Task 13)
.gitignore                            From create-next-app, plus !.env.example (Task 1)
AGENTS.md, CLAUDE.md                  Next.js agent rules (generated) + project notes (Tasks 1, 14)
README.md                             Setup, env reference, Google OAuth setup, deployment, testing (Task 14)
components.json                       shadcn config (Task 1)
docker-compose.yaml                   db (Task 4) and app (Task 12) services
docker/postgres-init/01-create-test-db.sql   Creates kortslutning_test (Task 4)
drizzle.config.ts                     drizzle-kit config (Task 4)
drizzle/                              Generated SQL migrations, committed (Task 4)
next.config.ts                        standalone output + migrations tracing (Tasks 1, 4)
scripts/smoke.mjs                     Standalone-server smoke test (Task 12)
vitest.config.ts                      unit + integration projects (Tasks 2, 4)
public/kthais-logo.svg                Logo (Task 1)
src/
  proxy.ts                            Host routing → NextResponse (Task 7)
  instrumentation.ts                  Env check + migrations at server start (Task 4)
  app/
    layout.tsx, globals.css, icon.svg Root layout, theme, favicon (Task 1)
    not-found.tsx, error.tsx          Branded 404 and error pages (Task 7)
    r/[slug]/page.tsx                 Resolve slug → 307 or 404 (Task 7)
    login/page.tsx                    Sign-in page (Task 8)
    (dashboard)/layout.tsx            Auth gate + header (Task 8)
    (dashboard)/page.tsx              Create form + links table + search (Task 9)
    (dashboard)/links/[slug]/page.tsx Edit, stats, delete, QR (Tasks 10, 11)
    api/auth/[...all]/route.ts        Better Auth handler (Task 8)
    api/qr/[slug]/route.ts            QR downloads (Task 11)
  components/
    ui/*                              shadcn primitives (Task 1)
    sign-in-button.tsx, sign-out-button.tsx, site-header.tsx   (Task 8)
    copy-button.tsx, create-link-form.tsx, links-table.tsx     (Task 9)
    edit-link-form.tsx, delete-link-button.tsx                 (Task 10)
    qr-code-card.tsx                                           (Task 11)
  lib/
    env.ts                            Typed, lazily parsed configuration (Task 2)
    routing.ts                        Pure host-routing decision (Task 7)
    format.ts                         Date formatting (Task 9)
    utils.ts                          shadcn cn() (Task 1)
    db/index.ts, schema.ts, auth-schema.ts, migrate.ts         (Task 4)
    auth/domain.ts, auth.ts, auth-client.ts, session.ts        (Task 8)
    links/validation.ts, slug.ts, short-url.ts                 Pure link rules (Task 3)
    links/repository.ts                                        SQL (Task 5)
    links/service.ts                                           Validation + persistence rules (Task 6)
    links/actions.ts                                           Server actions (Tasks 9, 10)
    links/qr.ts                                                QR rendering (Task 11)
  test/db.ts, test/global-setup.ts    Integration-test database helpers (Task 4)
```

Tests live next to their code: `*.test.ts` are unit tests; `*.int.test.ts` are integration tests against PostgreSQL.

---

### Task 1: Project scaffold

**Files:**
- Create (generated by `create-next-app`): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create (generated by `shadcn`): `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,input,label,table,alert-dialog,sonner,card,avatar}.tsx`
- Create: `public/kthais-logo.svg`, `src/app/icon.svg`
- Modify: `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: shadcn components under `@/components/ui/*` (`Button`, `buttonVariants`, `Input`, `Label`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `AlertDialog*`, `Toaster`, `Card*`, `Avatar`, `AvatarImage`, `AvatarFallback`); `cn` from `@/lib/utils`; static `/kthais-logo.svg`; npm scripts `dev`, `build`, `lint`, `typecheck`. The shadcn components use Base UI: compose with the `render` prop (e.g. `<AlertDialogTrigger render={<Button />}>`), not `asChild`.

- [ ] **Step 1: Scaffold into a temporary directory and copy it in**

The repository already contains `Dockerfile` and `docs/`, and `create-next-app` refuses to write into a directory with a `Dockerfile`, so generate the app elsewhere and copy it in:

```bash
SCAFFOLD_DIR="$(mktemp -d)"
npx --yes create-next-app@16.3.7 "$SCAFFOLD_DIR/app" --ts --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --skip-install --disable-git --yes
rsync -a --exclude node_modules --exclude .git --exclude README.md --exclude package-lock.json \
  "$SCAFFOLD_DIR/app/" ./
rm -rf "$SCAFFOLD_DIR"
git status --short
```

Expected: `Dockerfile` and `docs/` are untouched; new files include `package.json`, `src/app/`, `AGENTS.md`, `CLAUDE.md`, `eslint.config.mjs`, `next.config.ts`, `tsconfig.json`, `.gitignore`.

- [ ] **Step 2: Name the package, add the typecheck script, install**

```bash
npm pkg set name=kortslutning
npm pkg set scripts.typecheck="next typegen && tsc --noEmit"
npm install
npm install --save-dev @types/node@^22
```

`next typegen` generates the global `PageProps`/`LayoutProps`/`RouteContext` types, so `tsc` works on a fresh checkout (CI).

- [ ] **Step 3: Configure standalone output**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Dockerfile, which copies .next/standalone.
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Add shadcn/ui and the components the app uses**

```bash
npx --yes shadcn@4.21.0 init --defaults --yes --no-monorepo < /dev/null
npx --yes shadcn@4.21.0 add input label table alert-dialog sonner card avatar --yes < /dev/null
```

Expected: `components.json`, `src/lib/utils.ts` (`export { cn } from "cn"`) and `src/components/ui/{button,input,label,table,alert-dialog,sonner,card,avatar}.tsx` exist. `package.json` gains `@base-ui/react`, `class-variance-authority`, `cn` (shadcn's own class merger, published from `shadcn-ui/cn`), `lucide-react`, `next-themes`, `shadcn`, `sonner`, `tw-animate-css`.

- [ ] **Step 5: Add brand assets and remove the scaffold's**

```bash
if [ -d ../landingpage-frontend/public ]; then
  cp ../landingpage-frontend/public/kthais-logo.svg public/kthais-logo.svg
  cp ../landingpage-frontend/public/favicon.svg src/app/icon.svg
else
  gh api repos/kthaisociety/landingpage-frontend/contents/public/kthais-logo.svg --jq .content | base64 --decode > public/kthais-logo.svg
  gh api repos/kthaisociety/landingpage-frontend/contents/public/favicon.svg --jq .content | base64 --decode > src/app/icon.svg
fi
rm -f src/app/favicon.ico public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
head -c 80 public/kthais-logo.svg; echo
```

Expected: the file starts with `<svg width="902" height="908"`.

- [ ] **Step 6: Root layout, placeholder page, brand colour**

Replace `src/app/layout.tsx`. The font variable is `--font-sans` because shadcn's `globals.css` maps Tailwind's `font-sans` to `var(--font-sans)`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "ktha.is", template: "%s · ktha.is" },
  description: "KTH AI Society's link shortener.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
```

Replace `src/app/page.tsx` (removed again in Task 8):

```tsx
export default function HomePage() {
  return <main className="p-8">ktha.is</main>;
}
```

Append to the end of `src/app/globals.css` (later `:root` rules win):

```css
/* KTH AI Society brand colour, taken from kthais-logo.svg. */
:root {
  --primary: #1751a6;
  --primary-foreground: #ffffff;
  --ring: #1751a6;
}
```

- [ ] **Step 7: Allow committing `.env.example`**

In `.gitignore`, directly below the line `.env*`, add:

```gitignore
!.env.example
```

- [ ] **Step 8: Verify lint, types and build**

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all three succeed; the build output lists `○ /` and `○ /_not-found`. If lint reports problems only inside generated `src/components/ui/**`, add `"src/components/ui/**"` to the `globalIgnores([...])` list in `eslint.config.mjs` instead of editing generated code, then rerun.

- [ ] **Step 9: Commit**

```bash
git status --short   # confirm no .env or node_modules files are staged
git add -A
git commit -m "chore: scaffold Next.js 16 app with Tailwind and shadcn/ui" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Test runner and environment configuration

**Files:**
- Create: `vitest.config.ts`, `src/lib/env.ts`, `src/lib/env.test.ts`
- Modify: `package.json` (dependencies, scripts)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Env { dbUrl: string; googleClientId: string; googleClientSecret: string; betterAuthSecret: string; appUrl: string; appHost: string; shortUrl: string; shortHost: string; rootRedirectUrl: string }`. `appUrl`/`shortUrl` are origins without a trailing slash (`"https://ktha.is"`); `appHost`/`shortHost` are lowercase `host[:port]` (`"ktha.is"`, `"short.localhost:3000"`); `rootRedirectUrl` is a normalized href (`"https://kthais.com/"`).
  - `parseEnv(source: Record<string, string | undefined>): Env`. Throws `Error("Invalid environment configuration:\n  - NAME: reason")`.
  - `getEnv(): Env`. Parses `process.env` on first call and caches the result.
  - npm scripts `test` (`vitest run`) and `test:unit`.

- [ ] **Step 1: Install zod and Vitest, add scripts**

```bash
npm install zod@4.6.5
npm install --save-dev vitest@5.0.2
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:unit="vitest run --project unit"
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

try {
  // Integration tests read TEST_DB_URL from .env locally; CI sets real environment variables.
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Write the failing test `src/lib/env.test.ts`**

```ts
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
      rootRedirectUrl: "https://kthais.com/",
    });
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
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL, because `./env` cannot be resolved.

- [ ] **Step 5: Implement `src/lib/env.ts`**

```ts
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
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:unit`
Expected: PASS (13 tests in `env.test.ts`).

- [ ] **Step 7: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add package.json package-lock.json vitest.config.ts src/lib/env.ts src/lib/env.test.ts
git commit -m "feat: add validated environment configuration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Link rules (validation, random slugs, short-link formatting)

**Files:**
- Create: `src/lib/links/validation.ts`, `src/lib/links/validation.test.ts`, `src/lib/links/slug.ts`, `src/lib/links/slug.test.ts`, `src/lib/links/short-url.ts`, `src/lib/links/short-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SLUG_PATTERN: RegExp`, `MAX_TARGET_URL_LENGTH = 2048`
  - `type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `normalizeSlug(raw: string): string` trims and lowercases.
  - `isValidSlug(slug: string): boolean`
  - `parseSlugInput(raw: string): FieldResult<string | null>`. `null` means "generate a random slug".
  - `parseTargetUrl(raw: string, shortUrl: string): FieldResult<string>` returns a normalized href.
  - `escapeLikePattern(value: string): string`
  - `RANDOM_SLUG_ALPHABET`, `RANDOM_SLUG_LENGTH = 6`, `generateRandomSlug(randomIndex?: (max: number) => number): string`
  - `shortLinkUrl(shortUrl: string, slug: string): string` returns `"https://ktha.is/apply"`.
  - `shortLinkLabel(shortUrl: string, slug: string): string` returns `"ktha.is/apply"`.

- [ ] **Step 1: Write the failing test `src/lib/links/validation.test.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `src/lib/links/slug.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { generateRandomSlug, RANDOM_SLUG_ALPHABET, RANDOM_SLUG_LENGTH } from "./slug";
import { isValidSlug } from "./validation";

describe("RANDOM_SLUG_ALPHABET", () => {
  it("has 31 characters without look-alikes", () => {
    expect(RANDOM_SLUG_ALPHABET).toHaveLength(31);
    for (const char of "01ilo") {
      expect(RANDOM_SLUG_ALPHABET).not.toContain(char);
    }
  });
});

describe("generateRandomSlug", () => {
  it("produces valid 6-character slugs from the alphabet", () => {
    for (let i = 0; i < 1000; i++) {
      const slug = generateRandomSlug();
      expect(slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("maps random indexes onto the alphabet", () => {
    expect(generateRandomSlug(() => 0)).toBe("222222");
    expect(generateRandomSlug((max) => max - 1)).toBe("zzzzzz");
  });

  it("asks for one index per character, below the alphabet length", () => {
    const randomIndex = vi.fn(() => 0);
    generateRandomSlug(randomIndex);
    expect(randomIndex).toHaveBeenCalledTimes(RANDOM_SLUG_LENGTH);
    expect(randomIndex).toHaveBeenCalledWith(RANDOM_SLUG_ALPHABET.length);
  });
});
```

- [ ] **Step 3: Write the failing test `src/lib/links/short-url.test.ts`**

```ts
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
```

- [ ] **Step 4: Run them and watch them fail**

Run: `npm run test:unit`
Expected: FAIL, because `./validation`, `./slug` and `./short-url` cannot be resolved.

- [ ] **Step 5: Implement `src/lib/links/validation.ts`**

```ts
/** 1–64 characters of a-z, 0-9 and "-", not starting or ending with "-". Mirrored by the links_slug_format DB constraint. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const MAX_TARGET_URL_LENGTH = 2048;

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Parses the optional slug field. `value: null` means "generate a random slug". */
export function parseSlugInput(raw: string): FieldResult<string | null> {
  const slug = normalizeSlug(raw);
  if (slug === "") return { ok: true, value: null };
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "Use 1–64 lowercase letters, digits or hyphens, not starting or ending with a hyphen.",
    };
  }
  return { ok: true, value: slug };
}

/** Parses a destination URL. The returned href is normalized and safe to send in a Location header. */
export function parseTargetUrl(raw: string, shortUrl: string): FieldResult<string> {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Enter the URL to redirect to." };

  const tooLong = { ok: false, error: `The URL can be at most ${MAX_TARGET_URL_LENGTH} characters.` } as const;
  if (value.length > MAX_TARGET_URL_LENGTH) return tooLong;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Enter a full URL, including https://." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// URLs are allowed." };
  }

  const shortHostname = new URL(shortUrl).hostname;
  if (url.hostname.replace(/\.$/, "") === shortHostname) {
    return { ok: false, error: `Links can't point to ${shortHostname} itself.` };
  }

  if (url.href.length > MAX_TARGET_URL_LENGTH) return tooLong;
  return { ok: true, value: url.href };
}

/** Escapes %, _ and \ so user input matches literally inside a LIKE/ILIKE pattern. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
```

- [ ] **Step 6: Implement `src/lib/links/slug.ts`**

```ts
import { randomInt } from "node:crypto";

/** Lowercase letters and digits without look-alikes (0/o, 1/l/i). */
export const RANDOM_SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const RANDOM_SLUG_LENGTH = 6;

/** `randomIndex(max)` must return an integer in [0, max). Injectable for tests. */
export function generateRandomSlug(randomIndex: (max: number) => number = (max) => randomInt(max)): string {
  let slug = "";
  for (let i = 0; i < RANDOM_SLUG_LENGTH; i++) {
    slug += RANDOM_SLUG_ALPHABET[randomIndex(RANDOM_SLUG_ALPHABET.length)];
  }
  return slug;
}
```

- [ ] **Step 7: Implement `src/lib/links/short-url.ts`**

```ts
/** Full short link, e.g. "https://ktha.is/apply". Used for copying and in QR codes. */
export function shortLinkUrl(shortUrl: string, slug: string): string {
  return `${new URL(shortUrl).origin}/${slug}`;
}

/** Display form without the scheme, e.g. "ktha.is/apply". */
export function shortLinkLabel(shortUrl: string, slug: string): string {
  return `${new URL(shortUrl).host}/${slug}`;
}
```

- [ ] **Step 8: Run the tests**

Run: `npm run test:unit`
Expected: PASS (all tests in `env`, `validation`, `slug`, `short-url`).

- [ ] **Step 9: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/lib/links
git commit -m "feat: add slug and destination URL rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Database, migrations and integration-test harness

**Files:**
- Create: `docker-compose.yaml`, `docker/postgres-init/01-create-test-db.sql`, `.env.example`, `drizzle.config.ts`, `src/lib/db/auth-schema.ts`, `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/migrate.ts`, `src/instrumentation.ts`, `src/test/db.ts`, `src/test/global-setup.ts`, `src/lib/db/schema.int.test.ts`, `drizzle/0000_init.sql` + `drizzle/meta/*` (generated)
- Modify: `vitest.config.ts`, `next.config.ts`, `package.json`

**Interfaces:**
- Consumes: `getEnv()` from `@/lib/env` (Task 2).
- Produces:
  - Tables `user`, `session`, `account`, `verification` (Better Auth) and `links` (`slug`, `targetUrl`, `clickCount`, `lastClickedAt`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`), exported from `@/lib/db/schema`.
  - `type Database = NodePgDatabase<typeof schema>`
  - `createDb(connectionString: string): { db: Database; pool: pg.Pool }`
  - `getDb(): Database` is lazy and cached on `globalThis`.
  - `runMigrations(db: Database, migrationsFolder?: string): Promise<void>` and `MIGRATIONS_FOLDER`
  - Test helpers in `src/test/db.ts`: `createTestDb(): { db; pool }`, `resetDb(db): Promise<void>`, `createTestUser(db, overrides?): Promise<typeof user.$inferSelect>`
  - npm scripts `db:generate`, `db:migrate`, `test:int`

- [ ] **Step 1: Install Drizzle and node-postgres**

```bash
npm install drizzle-orm@0.45.3 pg@8.23.0
npm install --save-dev drizzle-kit@0.31.11 @types/pg@^8
npm pkg set scripts.db:generate="drizzle-kit generate"
npm pkg set scripts.db:migrate="drizzle-kit migrate"
npm pkg set scripts.test:int="vitest run --project integration"
```

- [ ] **Step 2: Local Postgres with a test database**

Create `docker-compose.yaml`:

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: kortslutning
      POSTGRES_PASSWORD: kortslutning
      POSTGRES_DB: kortslutning
    ports:
      - "5432:5432"
    volumes:
      # Postgres 18 images keep data under /var/lib/postgresql/<major>/docker, so mount the parent.
      - db-data:/var/lib/postgresql
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kortslutning -d kortslutning"]
      interval: 2s
      timeout: 5s
      retries: 30

volumes:
  db-data:
```

Create `docker/postgres-init/01-create-test-db.sql` (runs only when the volume is first created):

```sql
CREATE DATABASE kortslutning_test;
```

Create `.env.example`:

```dotenv
# Copy to .env for local development: cp .env.example .env
# The app refuses to start if any of these (except TEST_DB_URL) is missing or invalid.

# PostgreSQL: matches the `db` service in docker-compose.yaml
DB_URL=postgres://kortslutning:kortslutning@localhost:5432/kortslutning
# Used only by integration tests (database created by docker/postgres-init)
TEST_DB_URL=postgres://kortslutning:kortslutning@localhost:5432/kortslutning_test

# Google OAuth client: see "Google Cloud OAuth setup" in README.md
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Signs session cookies. Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=

# Dashboard and short-link origins. Browsers resolve *.localhost to your machine.
APP_URL=http://localhost:3000
SHORT_URL=http://short.localhost:3000

# Where the bare short domain (https://ktha.is/) redirects
ROOT_REDIRECT_URL=https://kthais.com
```

Create a local `.env` (git-ignored) with placeholder Google credentials and a generated secret, unless one already exists:

```bash
[ -f .env ] || {
  cp .env.example .env
  sed -i.bak \
    -e "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=local-placeholder|" \
    -e "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=local-placeholder|" \
    -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" \
    .env && rm .env.bak
}
docker compose up -d --wait db
docker compose exec -T db psql -U kortslutning -d kortslutning -c '\l' | grep kortslutning_test
```

Expected: a row for `kortslutning_test`. If port 5432 is already in use by another Postgres, stop that server first.

- [ ] **Step 3: drizzle-kit config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: use the real environment.
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DB_URL ?? "" },
  strict: true,
});
```

- [ ] **Step 4: Better Auth schema**

Create `src/lib/db/auth-schema.ts` with exactly this content. It is the output of `npx auth@1.7.6 generate` for a Postgres Drizzle adapter, captured during planning, so it needs no auth config to exist yet:

```ts
// Generated by `npx auth@1.7.6 generate` (Better Auth CLI) for drizzle/pg. Regenerate rather than hand-edit.
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
```

- [ ] **Step 5: Links schema**

Create `src/lib/db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

export const links = pgTable(
  "links",
  {
    slug: text("slug").primaryKey(),
    targetUrl: text("target_url").notNull(),
    clickCount: integer("click_count").notNull().default(0),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Same rule as SLUG_PATTERN in src/lib/links/validation.ts.
    check("links_slug_format", sql`${table.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`),
    index("links_created_at_idx").on(table.createdAt),
  ],
);
```

- [ ] **Step 6: Generate the migration**

```bash
npm run db:generate -- --name init
grep -n "links_slug_format\|CREATE TABLE" drizzle/0000_init.sql
```

Expected: `drizzle/0000_init.sql` contains `CREATE TABLE` for `account`, `links`, `session`, `user`, `verification`, and the line `CONSTRAINT "links_slug_format" CHECK ("links"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')`. `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json` exist.

- [ ] **Step 7: Database client and migrator**

Create `src/lib/db/index.ts`:

```ts
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(connectionString: string): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle({ client: pool, schema }), pool };
}

// Cached on globalThis so `next dev` hot reloads reuse one connection pool.
const globalForDb = globalThis as typeof globalThis & { kortslutningDb?: Database };

/** The app's shared database handle, created on first use. */
export function getDb(): Database {
  globalForDb.kortslutningDb ??= createDb(getEnv().dbUrl).db;
  return globalForDb.kortslutningDb;
}
```

Create `src/lib/db/migrate.ts`:

```ts
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./index";

/** SQL migrations generated by drizzle-kit; shipped in .next/standalone via outputFileTracingIncludes. */
export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export async function runMigrations(db: Database, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  await migrate(db, { migrationsFolder });
}
```

- [ ] **Step 8: Migrate and validate configuration at server start**

Create `src/instrumentation.ts`. `register()` runs once when the server starts, not during `next build`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("./lib/env");
  getEnv(); // Fail fast, naming any missing or invalid variable.

  const { getDb } = await import("./lib/db");
  const { runMigrations } = await import("./lib/db/migrate");
  await runMigrations(getDb());
}
```

Replace `next.config.ts` so the migrations always ship inside the standalone output:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Dockerfile, which copies .next/standalone.
  output: "standalone",
  // Migrations are read from disk at server start (src/instrumentation.ts).
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
```

- [ ] **Step 9: Integration-test harness**

Create `src/test/db.ts` (relative imports, because it is also loaded by the global setup):

```ts
import { sql } from "drizzle-orm";
import { createDb, type Database } from "../lib/db";
import { user } from "../lib/db/schema";

function testDbUrl(): string {
  const url = process.env.TEST_DB_URL;
  if (!url) {
    throw new Error(
      "TEST_DB_URL is not set. Run `docker compose up -d db` and `cp .env.example .env` (see README).",
    );
  }
  return url;
}

export function createTestDb() {
  return createDb(testDbUrl());
}

/** Empties all tables. Truncating "user" cascades to session, account and links. */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE links, "user" CASCADE`);
}

let userCounter = 0;

export async function createTestUser(db: Database, overrides: Partial<typeof user.$inferInsert> = {}) {
  userCounter += 1;
  const unique = `${userCounter}-${Date.now()}`;
  const [row] = await db
    .insert(user)
    .values({
      id: `test-user-${unique}`,
      name: `Test User ${userCounter}`,
      email: `test-${unique}@kthais.com`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row;
}
```

Create `src/test/global-setup.ts`:

```ts
import { runMigrations } from "../lib/db/migrate";
import { createTestDb } from "./db";

export default async function setup() {
  const { db, pool } = createTestDb();
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
```

Replace `vitest.config.ts` to add the integration project (sequential files, since they share one database):

```ts
import { defineConfig } from "vitest/config";

try {
  // Integration tests read TEST_DB_URL from .env locally; CI sets real environment variables.
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["./src/test/global-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
```

- [ ] **Step 10: Write the schema integration test `src/lib/db/schema.int.test.ts`**

```ts
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { links } from "./schema";

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

describe("links table", () => {
  it("stores a link with defaults", async () => {
    const author = await createTestUser(db);
    await db.insert(links).values({
      slug: "apply",
      targetUrl: "https://example.com/",
      createdBy: author.id,
      updatedBy: author.id,
    });
    const [row] = await db.select().from(links);
    expect(row).toMatchObject({ slug: "apply", clickCount: 0, lastClickedAt: null, createdBy: author.id });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it.each(["-apply", "apply-", "Apply", "a_b", "a.b", "", "x".repeat(65)])(
    "rejects the invalid slug %j with the check constraint",
    async (slug) => {
      await expect(db.insert(links).values({ slug, targetUrl: "https://example.com/" }).execute()).rejects.toMatchObject(
        { cause: { code: "23514" } },
      );
    },
  );

  it("keeps links when their author is deleted", async () => {
    const author = await createTestUser(db);
    await db.insert(links).values({
      slug: "keep",
      targetUrl: "https://example.com/",
      createdBy: author.id,
      updatedBy: author.id,
    });
    await db.execute(sql`DELETE FROM "user" WHERE id = ${author.id}`);
    const [row] = await db.select().from(links);
    expect(row).toMatchObject({ slug: "keep", createdBy: null, updatedBy: null });
  });
});
```

Drizzle wraps driver errors in `DrizzleQueryError`; the Postgres error code is on `.cause.code` (verified during planning).

- [ ] **Step 11: Run all tests**

Run: `npm test`
Expected: PASS for both the `unit` and `integration` projects. If you see `TEST_DB_URL is not set`, `.env` is missing. If you see `ECONNREFUSED`, Postgres is not running (`docker compose up -d --wait db`).

- [ ] **Step 12: Verify the build still works without env, then commit**

```bash
npm run lint && npm run typecheck && npm run build
ls .next/standalone/drizzle
```

Expected: the build succeeds, and `.next/standalone/drizzle` contains `0000_init.sql` and `meta`.

```bash
git add package.json package-lock.json docker-compose.yaml docker .env.example drizzle.config.ts drizzle \
  next.config.ts vitest.config.ts src/lib/db src/instrumentation.ts src/test
git commit -m "feat: add PostgreSQL schema, migrations and test database harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Link repository

**Files:**
- Create: `src/lib/links/repository.ts`, `src/lib/links/repository.int.test.ts`

**Interfaces:**
- Consumes: `Database` from `@/lib/db`; `links`, `user` from `@/lib/db/schema`; `escapeLikePattern` from `./validation`; test helpers from `@/test/db` (Task 4).
- Produces:
  - `interface LinkRow { slug: string; targetUrl: string; clickCount: number; lastClickedAt: Date | null; createdAt: Date; updatedAt: Date; createdByName: string | null; updatedByName: string | null }`
  - `insertLink(db, { slug, targetUrl, userId }): Promise<boolean>` returns `false` when the slug is taken.
  - `updateLinkTarget(db, { slug, targetUrl, userId }): Promise<boolean>` returns `false` when the link is missing.
  - `deleteLink(db, slug): Promise<boolean>` returns `false` when the link is missing.
  - `getLink(db, slug): Promise<LinkRow | null>`
  - `listLinks(db, { query?: string }?): Promise<LinkRow[]>`, newest first.
  - `resolveLink(db, slug): Promise<string | null>` counts the click atomically.

  All functions expect already-normalized slugs.

- [ ] **Step 1: Write the failing test `src/lib/links/repository.int.test.ts`**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { links } from "@/lib/db/schema";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { deleteLink, getLink, insertLink, listLinks, resolveLink, updateLinkTarget } from "./repository";

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

async function seed(slug: string, targetUrl = `https://example.com/${slug}`) {
  const author = await createTestUser(db);
  expect(await insertLink(db, { slug, targetUrl, userId: author.id })).toBe(true);
  return author;
}

describe("insertLink and getLink", () => {
  it("inserts a link and reads it back with the author's name", async () => {
    const author = await createTestUser(db, { name: "Ada Lovelace" });
    expect(await insertLink(db, { slug: "apply", targetUrl: "https://example.com/apply", userId: author.id })).toBe(
      true,
    );
    expect(await getLink(db, "apply")).toMatchObject({
      slug: "apply",
      targetUrl: "https://example.com/apply",
      clickCount: 0,
      lastClickedAt: null,
      createdByName: "Ada Lovelace",
      updatedByName: "Ada Lovelace",
    });
  });

  it("returns false for a taken slug and keeps the original target", async () => {
    const author = await seed("apply", "https://example.com/original");
    expect(await insertLink(db, { slug: "apply", targetUrl: "https://example.com/other", userId: author.id })).toBe(
      false,
    );
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/original" });
  });

  it("returns null for an unknown slug", async () => {
    expect(await getLink(db, "missing")).toBeNull();
  });
});

describe("updateLinkTarget", () => {
  it("changes the target and records who changed it", async () => {
    const author = await createTestUser(db, { name: "Ada" });
    const editor = await createTestUser(db, { name: "Grace" });
    await insertLink(db, { slug: "apply", targetUrl: "https://example.com/old", userId: author.id });
    const longAgo = new Date("2020-01-01T00:00:00Z");
    await db.update(links).set({ updatedAt: longAgo });

    expect(await updateLinkTarget(db, { slug: "apply", targetUrl: "https://example.com/new", userId: editor.id })).toBe(
      true,
    );

    const link = await getLink(db, "apply");
    expect(link).toMatchObject({ targetUrl: "https://example.com/new", createdByName: "Ada", updatedByName: "Grace" });
    expect(link!.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("returns false when the link does not exist", async () => {
    const editor = await createTestUser(db);
    expect(await updateLinkTarget(db, { slug: "missing", targetUrl: "https://example.com/", userId: editor.id })).toBe(
      false,
    );
  });
});

describe("deleteLink", () => {
  it("deletes an existing link once", async () => {
    await seed("apply");
    expect(await deleteLink(db, "apply")).toBe(true);
    expect(await getLink(db, "apply")).toBeNull();
    expect(await deleteLink(db, "apply")).toBe(false);
  });
});

describe("listLinks", () => {
  it("lists links newest first", async () => {
    await seed("first");
    await seed("second");
    expect((await listLinks(db)).map((link) => link.slug)).toEqual(["second", "first"]);
  });

  it("searches slug and target case-insensitively", async () => {
    await seed("apply", "https://forms.example.com/join");
    await seed("slides", "https://docs.example.com/deck");
    expect((await listLinks(db, { query: "APP" })).map((link) => link.slug)).toEqual(["apply"]);
    expect((await listLinks(db, { query: "DECK" })).map((link) => link.slug)).toEqual(["slides"]);
    expect(await listLinks(db, { query: "   " })).toHaveLength(2);
  });

  it("matches %, _ and \\ literally instead of as wildcards", async () => {
    await seed("sale", "https://example.com/?code=100%_off");
    await seed("plain", "https://example.com/plain");
    expect((await listLinks(db, { query: "%" })).map((link) => link.slug)).toEqual(["sale"]);
    expect((await listLinks(db, { query: "_" })).map((link) => link.slug)).toEqual(["sale"]);
    expect(await listLinks(db, { query: "\\" })).toEqual([]);
  });
});

describe("resolveLink", () => {
  it("returns the target and counts each click", async () => {
    await seed("apply", "https://example.com/apply");
    expect(await resolveLink(db, "apply")).toBe("https://example.com/apply");
    expect(await resolveLink(db, "apply")).toBe("https://example.com/apply");
    const link = await getLink(db, "apply");
    expect(link).toMatchObject({ clickCount: 2 });
    expect(link!.lastClickedAt).toBeInstanceOf(Date);
  });

  it("returns null for unknown slugs without creating rows", async () => {
    expect(await resolveLink(db, "missing")).toBeNull();
    expect(await listLinks(db)).toEqual([]);
  });

  it("counts concurrent clicks exactly", async () => {
    await seed("apply");
    await Promise.all(Array.from({ length: 25 }, () => resolveLink(db, "apply")));
    expect((await getLink(db, "apply"))!.clickCount).toBe(25);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:int`
Expected: FAIL, because `./repository` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/links/repository.ts`**

```ts
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@/lib/db";
import { links, user } from "@/lib/db/schema";
import { escapeLikePattern } from "./validation";

/** A link as shown in the dashboard. Author names are null when the user row no longer exists. */
export interface LinkRow {
  slug: string;
  targetUrl: string;
  clickCount: number;
  lastClickedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  updatedByName: string | null;
}

const creator = alias(user, "creator");
const updater = alias(user, "updater");

function selectLinkRows(db: Database) {
  return db
    .select({
      slug: links.slug,
      targetUrl: links.targetUrl,
      clickCount: links.clickCount,
      lastClickedAt: links.lastClickedAt,
      createdAt: links.createdAt,
      updatedAt: links.updatedAt,
      createdByName: creator.name,
      updatedByName: updater.name,
    })
    .from(links)
    .leftJoin(creator, eq(links.createdBy, creator.id))
    .leftJoin(updater, eq(links.updatedBy, updater.id));
}

/** Inserts a link. Returns false if the slug is already taken. */
export async function insertLink(
  db: Database,
  input: { slug: string; targetUrl: string; userId: string },
): Promise<boolean> {
  const rows = await db
    .insert(links)
    .values({ slug: input.slug, targetUrl: input.targetUrl, createdBy: input.userId, updatedBy: input.userId })
    .onConflictDoNothing({ target: links.slug })
    .returning({ slug: links.slug });
  return rows.length === 1;
}

/** Changes a link's destination. Returns false if the link does not exist. */
export async function updateLinkTarget(
  db: Database,
  input: { slug: string; targetUrl: string; userId: string },
): Promise<boolean> {
  const rows = await db
    .update(links)
    .set({ targetUrl: input.targetUrl, updatedBy: input.userId, updatedAt: sql`now()` })
    .where(eq(links.slug, input.slug))
    .returning({ slug: links.slug });
  return rows.length === 1;
}

/** Deletes a link. Returns false if it did not exist. */
export async function deleteLink(db: Database, slug: string): Promise<boolean> {
  const rows = await db.delete(links).where(eq(links.slug, slug)).returning({ slug: links.slug });
  return rows.length === 1;
}

export async function getLink(db: Database, slug: string): Promise<LinkRow | null> {
  const [row] = await selectLinkRows(db).where(eq(links.slug, slug));
  return row ?? null;
}

/** All links, newest first. `query` matches the slug or target case-insensitively and literally. */
export async function listLinks(db: Database, options: { query?: string } = {}): Promise<LinkRow[]> {
  const query = options.query?.trim();
  const pattern = query ? `%${escapeLikePattern(query)}%` : undefined;
  return selectLinkRows(db)
    .where(pattern ? or(ilike(links.slug, pattern), ilike(links.targetUrl, pattern)) : undefined)
    .orderBy(desc(links.createdAt), links.slug);
}

/** Looks up a link for a visitor and counts the click, in one atomic statement. */
export async function resolveLink(db: Database, slug: string): Promise<string | null> {
  const [row] = await db
    .update(links)
    .set({ clickCount: sql`${links.clickCount} + 1`, lastClickedAt: sql`now()` })
    .where(eq(links.slug, slug))
    .returning({ targetUrl: links.targetUrl });
  return row?.targetUrl ?? null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS for both projects.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/lib/links/repository.ts src/lib/links/repository.int.test.ts
git commit -m "feat: add link repository with atomic click counting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Link service (rules + persistence)

**Files:**
- Create: `src/lib/links/service.ts`, `src/lib/links/service.int.test.ts`

**Interfaces:**
- Consumes: `insertLink`, `updateLinkTarget`, `deleteLink` (Task 5); `parseSlugInput`, `parseTargetUrl`, `normalizeSlug` (Task 3); `generateRandomSlug` (Task 3); `shortLinkLabel` (Task 3).
- Produces:
  - `type FieldErrors = Partial<Record<"slug" | "targetUrl", string>>`
  - `type LinkFailure = { ok: false; fieldErrors?: FieldErrors; message?: string }`
  - `type CreateLinkResult = { ok: true; slug: string } | LinkFailure`
  - `type MutationResult = { ok: true } | LinkFailure`
  - `MAX_RANDOM_SLUG_ATTEMPTS = 5`, `LINK_GONE_MESSAGE = "This link no longer exists."`, `RANDOM_SLUG_EXHAUSTED_MESSAGE`
  - `createLink(db, { userId, slug, targetUrl, shortUrl, generateSlug? }): Promise<CreateLinkResult>`
  - `updateLink(db, { userId, slug, targetUrl, shortUrl }): Promise<MutationResult>`
  - `removeLink(db, slug): Promise<MutationResult>`

  These functions accept raw form input and normalize it themselves.

- [ ] **Step 1: Write the failing test `src/lib/links/service.int.test.ts`**

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, createTestUser, resetDb } from "@/test/db";
import { getLink, listLinks } from "./repository";
import {
  createLink,
  LINK_GONE_MESSAGE,
  MAX_RANDOM_SLUG_ATTEMPTS,
  RANDOM_SLUG_EXHAUSTED_MESSAGE,
  removeLink,
  updateLink,
} from "./service";

const SHORT_URL = "https://ktha.is";
const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb(db);
});

describe("createLink", () => {
  it("creates a link with a normalized custom slug and target", async () => {
    const user = await createTestUser(db);
    expect(
      await createLink(db, {
        userId: user.id,
        slug: "  AI-Day ",
        targetUrl: " https://Example.com/ai-day ",
        shortUrl: SHORT_URL,
      }),
    ).toEqual({ ok: true, slug: "ai-day" });
    expect(await getLink(db, "ai-day")).toMatchObject({ targetUrl: "https://example.com/ai-day" });
  });

  it("reports errors for both fields at once and stores nothing", async () => {
    const user = await createTestUser(db);
    expect(
      await createLink(db, { userId: user.id, slug: "-bad-", targetUrl: "ftp://example.com", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, fieldErrors: { slug: expect.any(String), targetUrl: expect.any(String) } });
    expect(await listLinks(db)).toEqual([]);
  });

  it("reports a taken slug using the short host", async () => {
    const user = await createTestUser(db);
    const input = { userId: user.id, slug: "apply", targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    expect(await createLink(db, input)).toEqual({ ok: true, slug: "apply" });
    expect(await createLink(db, input)).toEqual({
      ok: false,
      fieldErrors: { slug: "ktha.is/apply is already taken." },
    });
  });

  it("generates a random slug when the slug is blank", async () => {
    const user = await createTestUser(db);
    const result = await createLink(db, {
      userId: user.id,
      slug: "   ",
      targetUrl: "https://example.com/",
      shortUrl: SHORT_URL,
    });
    expect(result).toEqual({ ok: true, slug: expect.stringMatching(/^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/) });
    if (!result.ok) throw new Error("expected success");
    expect(await getLink(db, result.slug)).not.toBeNull();
  });

  it("retries when a random slug is already taken", async () => {
    const user = await createTestUser(db);
    const base = { userId: user.id, targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    await createLink(db, { ...base, slug: "taken1" });
    const candidates = ["taken1", "fresh1"];
    const generateSlug = vi.fn(() => candidates.shift() ?? "unused");

    expect(await createLink(db, { ...base, slug: "", generateSlug })).toEqual({ ok: true, slug: "fresh1" });
    expect(generateSlug).toHaveBeenCalledTimes(2);
  });

  it(`gives up after ${MAX_RANDOM_SLUG_ATTEMPTS} taken random slugs`, async () => {
    const user = await createTestUser(db);
    const base = { userId: user.id, targetUrl: "https://example.com/", shortUrl: SHORT_URL };
    await createLink(db, { ...base, slug: "taken1" });
    const generateSlug = vi.fn(() => "taken1");

    expect(await createLink(db, { ...base, slug: "", generateSlug })).toEqual({
      ok: false,
      message: RANDOM_SLUG_EXHAUSTED_MESSAGE,
    });
    expect(generateSlug).toHaveBeenCalledTimes(MAX_RANDOM_SLUG_ATTEMPTS);
  });
});

describe("updateLink", () => {
  it("updates the target and accepts a mixed-case slug", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/old", shortUrl: SHORT_URL });
    expect(
      await updateLink(db, { userId: user.id, slug: "Apply", targetUrl: "https://example.com/new", shortUrl: SHORT_URL }),
    ).toEqual({ ok: true });
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/new" });
  });

  it("rejects an invalid target and leaves the link unchanged", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/old", shortUrl: SHORT_URL });
    expect(
      await updateLink(db, { userId: user.id, slug: "apply", targetUrl: "https://ktha.is/loop", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, fieldErrors: { targetUrl: "Links can't point to ktha.is itself." } });
    expect(await getLink(db, "apply")).toMatchObject({ targetUrl: "https://example.com/old" });
  });

  it("reports a link that no longer exists", async () => {
    const user = await createTestUser(db);
    expect(
      await updateLink(db, { userId: user.id, slug: "gone", targetUrl: "https://example.com/", shortUrl: SHORT_URL }),
    ).toEqual({ ok: false, message: LINK_GONE_MESSAGE });
  });
});

describe("removeLink", () => {
  it("deletes once, then reports the link as gone", async () => {
    const user = await createTestUser(db);
    await createLink(db, { userId: user.id, slug: "apply", targetUrl: "https://example.com/", shortUrl: SHORT_URL });
    expect(await removeLink(db, "APPLY")).toEqual({ ok: true });
    expect(await removeLink(db, "apply")).toEqual({ ok: false, message: LINK_GONE_MESSAGE });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:int`
Expected: FAIL, because `./service` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/links/service.ts`**

```ts
import type { Database } from "@/lib/db";
import { deleteLink, insertLink, updateLinkTarget } from "./repository";
import { shortLinkLabel } from "./short-url";
import { generateRandomSlug } from "./slug";
import { normalizeSlug, parseSlugInput, parseTargetUrl } from "./validation";

export type FieldErrors = Partial<Record<"slug" | "targetUrl", string>>;
export type LinkFailure = { ok: false; fieldErrors?: FieldErrors; message?: string };
export type CreateLinkResult = { ok: true; slug: string } | LinkFailure;
export type MutationResult = { ok: true } | LinkFailure;

export const MAX_RANDOM_SLUG_ATTEMPTS = 5;
export const LINK_GONE_MESSAGE = "This link no longer exists.";
export const RANDOM_SLUG_EXHAUSTED_MESSAGE = "Couldn't find a free random slug. Try again, or choose one yourself.";

export interface CreateLinkInput {
  userId: string;
  /** Raw form value; blank means "generate a random slug". */
  slug: string;
  targetUrl: string;
  shortUrl: string;
  /** Injectable for tests. */
  generateSlug?: () => string;
}

export async function createLink(db: Database, input: CreateLinkInput): Promise<CreateLinkResult> {
  const slug = parseSlugInput(input.slug);
  const targetUrl = parseTargetUrl(input.targetUrl, input.shortUrl);
  if (!slug.ok || !targetUrl.ok) {
    const fieldErrors: FieldErrors = {};
    if (!slug.ok) fieldErrors.slug = slug.error;
    if (!targetUrl.ok) fieldErrors.targetUrl = targetUrl.error;
    return { ok: false, fieldErrors };
  }

  if (slug.value !== null) {
    const inserted = await insertLink(db, { slug: slug.value, targetUrl: targetUrl.value, userId: input.userId });
    if (!inserted) {
      return { ok: false, fieldErrors: { slug: `${shortLinkLabel(input.shortUrl, slug.value)} is already taken.` } };
    }
    return { ok: true, slug: slug.value };
  }

  const generateSlug = input.generateSlug ?? (() => generateRandomSlug());
  for (let attempt = 0; attempt < MAX_RANDOM_SLUG_ATTEMPTS; attempt++) {
    const candidate = generateSlug();
    if (await insertLink(db, { slug: candidate, targetUrl: targetUrl.value, userId: input.userId })) {
      return { ok: true, slug: candidate };
    }
  }
  return { ok: false, message: RANDOM_SLUG_EXHAUSTED_MESSAGE };
}

export async function updateLink(
  db: Database,
  input: { userId: string; slug: string; targetUrl: string; shortUrl: string },
): Promise<MutationResult> {
  const targetUrl = parseTargetUrl(input.targetUrl, input.shortUrl);
  if (!targetUrl.ok) return { ok: false, fieldErrors: { targetUrl: targetUrl.error } };
  const updated = await updateLinkTarget(db, {
    slug: normalizeSlug(input.slug),
    targetUrl: targetUrl.value,
    userId: input.userId,
  });
  return updated ? { ok: true } : { ok: false, message: LINK_GONE_MESSAGE };
}

export async function removeLink(db: Database, slug: string): Promise<MutationResult> {
  const deleted = await deleteLink(db, normalizeSlug(slug));
  return deleted ? { ok: true } : { ok: false, message: LINK_GONE_MESSAGE };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS for both projects.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
npm run lint && npm run typecheck
git add src/lib/links/service.ts src/lib/links/service.int.test.ts
git commit -m "feat: add link service with random slug retries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Host routing, redirect page, 404 and error pages

**Files:**
- Create: `src/lib/routing.ts`, `src/lib/routing.test.ts`, `src/proxy.ts`, `src/app/r/[slug]/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`

**Interfaces:**
- Consumes: `getEnv()` (Task 2); `getDb()` (Task 4); `resolveLink` (Task 5); `normalizeSlug`, `isValidSlug` (Task 3); `Button` (Task 1).
- Produces:
  - `type RouteDecision = { type: "next" } | { type: "redirect"; location: string } | { type: "rewrite"; pathname: string } | { type: "notFound" }`
  - `interface RoutingConfig { shortHost: string; rootRedirectUrl: string }`
  - `routeRequest(host: string | null, pathname: string, config: RoutingConfig): RouteDecision`
  - The internal route `/r/[slug]`, reachable only via the short host.

- [ ] **Step 1: Write the failing test `src/lib/routing.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { routeRequest, type RoutingConfig } from "./routing";

const config: RoutingConfig = { shortHost: "ktha.is", rootRedirectUrl: "https://kthais.com/" };

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

  it("treats a missing Host header as the app host", () => {
    expect(routeRequest(null, "/apply", config)).toEqual({ type: "next" });
  });

  it("compares hosts including the port", () => {
    const local: RoutingConfig = { shortHost: "short.localhost:3000", rootRedirectUrl: "https://kthais.com/" };
    expect(routeRequest("short.localhost:3000", "/apply", local)).toEqual({ type: "rewrite", pathname: "/r/apply" });
    expect(routeRequest("localhost:3000", "/apply", local)).toEqual({ type: "next" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL, because `./routing` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/routing.ts`**

```ts
export type RouteDecision =
  | { type: "next" }
  | { type: "redirect"; location: string }
  | { type: "rewrite"; pathname: string }
  | { type: "notFound" };

export interface RoutingConfig {
  /** Short-link host (with port, if any), lowercase, e.g. "ktha.is". */
  shortHost: string;
  rootRedirectUrl: string;
}

/** Internal page that resolves slugs (src/app/r/[slug]/page.tsx). Only reachable via the short host. */
const REDIRECT_ROUTE = "/r";
const SINGLE_SEGMENT = /^\/([^/]+)$/;

/**
 * Decides what to do with a request based on its Host header and path.
 * - Short host: "/" → redirect to the main site; "/<slug>" → the redirect page; "/<file.ext>" → static file; else 404.
 * - Any other host is the dashboard; the internal redirect route is hidden there.
 */
export function routeRequest(host: string | null, pathname: string, config: RoutingConfig): RouteDecision {
  if (host?.toLowerCase() === config.shortHost) {
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
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Implement `src/proxy.ts`**

```ts
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
```

- [ ] **Step 6: Implement the redirect page `src/app/r/[slug]/page.tsx`**

`redirect()` sends a real 307 only if it runs before streaming starts, so never add a `loading.tsx` or Suspense boundary above this route.

```tsx
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { resolveLink } from "@/lib/links/repository";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

// Reached only through the proxy's rewrite of ktha.is/<slug>.
export default async function RedirectPage({ params }: PageProps<"/r/[slug]">) {
  await connection(); // Render per request, so every visit is counted.
  const slug = normalizeSlug((await params).slug);
  if (!isValidSlug(slug)) notFound();

  const target = await resolveLink(getDb(), slug);
  if (!target) notFound();
  redirect(target);
}
```

- [ ] **Step 7: Branded 404 and error pages**

Create `src/app/not-found.tsx`. It is prerendered at build time, so it must not read env:

```tsx
import Image from "next/image";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Image src="/kthais-logo.svg" alt="KTH AI Society" width={56} height={56} />
      <h1 className="text-2xl font-semibold">Link not found</h1>
      <p className="max-w-sm text-muted-foreground">
        This link doesn&apos;t exist or has been removed. Check it for typos, or ask whoever shared it with you.
      </p>
    </main>
  );
}
```

Create `src/app/error.tsx` (Next.js 16.3 passes `retry`):

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-muted-foreground">Please try again in a moment.</p>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
```

- [ ] **Step 8: Check the routing table against the dev server**

```bash
docker compose up -d --wait db
npm run dev    # run in the background; wait until it prints "Ready"
```

Then:

```bash
docker compose exec -T db psql -U kortslutning -d kortslutning -c \
  "INSERT INTO links (slug, target_url) VALUES ('hello', 'https://example.com/') ON CONFLICT (slug) DO NOTHING;"
for p in / /hello /HELLO /nope /a/b; do
  printf '%-7s ' "$p"
  curl -s -o /dev/null -w '%{http_code} %header{location}\n' -H 'Host: short.localhost:3000' "http://localhost:3000$p"
done
printf 'app /r/hello: '; curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/r/hello
docker compose exec -T db psql -U kortslutning -d kortslutning -tAc "SELECT click_count FROM links WHERE slug = 'hello';"
```

Expected:

```
/       307 https://kthais.com/
/hello  307 https://example.com/
/HELLO  307 https://example.com/
/nope   404
/a/b    404
app /r/hello: 404
2
```

(The count is higher if you ran the loop more than once.) Stop the dev server: `lsof -ti tcp:3000 | xargs kill`.

- [ ] **Step 9: Lint, typecheck, build, commit**

```bash
npm run lint && npm run typecheck && npm test && npm run build
git add src/lib/routing.ts src/lib/routing.test.ts src/proxy.ts src/app/r src/app/not-found.tsx src/app/error.tsx
git commit -m "feat: route short-domain requests to slug redirects" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Google sign-in restricted to @kthais.com

**Files:**
- Create: `src/lib/auth/domain.ts`, `src/lib/auth/domain.test.ts`, `src/lib/auth/auth.ts`, `src/lib/auth/auth-client.ts`, `src/lib/auth/session.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/login/page.tsx`, `src/components/sign-in-button.tsx`, `src/components/sign-out-button.tsx`, `src/components/site-header.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`
- Delete: `src/app/page.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getEnv()` (Task 2); `getDb()`, `schema` (Task 4); `Button`, `Card*`, `Avatar*` (Task 1).
- Produces:
  - `ALLOWED_EMAIL_DOMAIN = "kthais.com"`, `DOMAIN_ERROR_MESSAGE = "Only @kthais.com accounts can sign in."`
  - `isAllowedEmail(email: string | null | undefined, emailVerified: boolean | null | undefined): boolean`
  - `getAuth()` returns the lazily created Better Auth instance.
  - `authClient` for client components.
  - `interface CurrentUser { id: string; name: string; email: string; image: string | null }`
  - `getCurrentUser(): Promise<CurrentUser | null>`, deduplicated per request.
  - `requireUser(): Promise<CurrentUser>` redirects to `/login` when there is no user.
  - `<SiteHeader user={CurrentUser} />`
  - The `(dashboard)` route group, whose layout enforces sign-in.

- [ ] **Step 1: Install Better Auth**

```bash
npm install better-auth@1.7.6
```

- [ ] **Step 2: Write the failing test `src/lib/auth/domain.test.ts`**

```ts
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
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL, because `./domain` cannot be resolved.

- [ ] **Step 4: Implement `src/lib/auth/domain.ts`**

```ts
export const ALLOWED_EMAIL_DOMAIN = "kthais.com";
export const DOMAIN_ERROR_MESSAGE = `Only @${ALLOWED_EMAIL_DOMAIN} accounts can sign in.`;

/** True only for a verified address whose domain is exactly ALLOWED_EMAIL_DOMAIN (no subdomains). */
export function isAllowedEmail(
  email: string | null | undefined,
  emailVerified: boolean | null | undefined,
): boolean {
  if (!email || emailVerified !== true) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0) return false;
  return email.slice(at + 1).toLowerCase() === ALLOWED_EMAIL_DOMAIN;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Better Auth server, client and session helpers**

Create `src/lib/auth/auth.ts`:

```ts
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
```

Create `src/lib/auth/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

Create `src/lib/auth/session.ts`:

```ts
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
  const session = await getAuth().api.getSession({ headers: await headers() });
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
```

Create `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth";

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
```

- [ ] **Step 7: Sign-in and sign-out buttons**

Create `src/components/sign-in-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    // On failure Better Auth redirects to /login?error=<code>.
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    if (error) {
      setPending(false);
      toast.error("Couldn't start sign-in. Please try again.");
    }
  }

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={signIn}>
      {pending ? "Redirecting to Google…" : "Sign in with Google"}
    </Button>
  );
}
```

Create `src/components/sign-out-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}
```

- [ ] **Step 8: Login page**

Create `src/app/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SignInButton } from "@/components/sign-in-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOMAIN_ERROR_MESSAGE } from "@/lib/auth/domain";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Image src="/kthais-logo.svg" alt="" width={48} height={48} className="mx-auto" />
          <CardTitle className="text-xl">ktha.is</CardTitle>
          <CardDescription>KTH AI Society&apos;s link shortener</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error !== undefined && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Sign-in failed. {DOMAIN_ERROR_MESSAGE}
            </p>
          )}
          <SignInButton />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 9: Header and the authenticated route group**

Create `src/components/site-header.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CurrentUser } from "@/lib/auth/session";

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

export function SiteHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image src="/kthais-logo.svg" alt="" width={28} height={28} />
          ktha.is
        </Link>
        <div className="flex items-center gap-3">
          <Avatar className="size-7">
            {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{user.name}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

Create `src/app/(dashboard)/layout.tsx`:

```tsx
import { SiteHeader } from "@/components/site-header";
import { requireUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
```

Replace the placeholder home page: delete `src/app/page.tsx`, then create `src/app/(dashboard)/page.tsx` (Task 9 fills it in):

```bash
git rm -q src/app/page.tsx
```

```tsx
import { requireUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const user = await requireUser();
  return <p>Signed in as {user.email}.</p>;
}
```

- [ ] **Step 10: Verify the build works with no environment (Review Focus 2)**

```bash
npm run lint && npm run typecheck && npm test
mv .env .env.off; npm run build; status=$?; mv .env.off .env; test $status -eq 0 && echo "BUILD OK WITHOUT ENV"
```

Expected: `BUILD OK WITHOUT ENV`. A failure mentioning `Invalid environment configuration` means some module calls `getEnv()`/`getDb()`/`getAuth()` at import time; move the call inside a function.

- [ ] **Step 11: Check the unauthenticated flow**

Start `npm run dev` in the background, then:

```bash
curl -s -o /dev/null -w '%{http_code} %header{location}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
curl -s http://localhost:3000/api/auth/get-session; echo
curl -s 'http://localhost:3000/login?error=unable_to_create_user' | grep -o 'Only @kthais.com accounts can sign in.'
```

Expected: `307 /login`, `200`, `null`, `Only @kthais.com accounts can sign in.`. Stop the server: `lsof -ti tcp:3000 | xargs kill`.

Human check, only if real Google credentials are in `.env` (README, "Google Cloud OAuth setup"): at http://localhost:3000, sign in with an `@kthais.com` account and the dashboard shows "Signed in as …". Signing in with any other Google account lands back on `/login` with the error.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/lib/auth src/app/api/auth src/app/login src/app/\(dashboard\) \
  src/components/sign-in-button.tsx src/components/sign-out-button.tsx src/components/site-header.tsx
git commit -m "feat: add Google sign-in restricted to kthais.com" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Dashboard: create, list and search links

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`, `src/lib/links/actions.ts`, `src/components/copy-button.tsx`, `src/components/create-link-form.tsx`, `src/components/links-table.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `requireUser` (Task 8); `getDb` (Task 4); `getEnv` (Task 2); `createLink`, `FieldErrors` (Task 6); `listLinks`, `LinkRow` (Task 5); `shortLinkUrl`, `shortLinkLabel` (Task 3); UI components (Task 1).
- Produces:
  - `formatDateTime(date: Date | null): string` returns `"2026-01-15 13:34"` (Europe/Stockholm) or `"—"`.
  - `interface LinkFormState { status: "idle" | "success" | "error"; message?: string; fieldErrors?: FieldErrors; values?: { slug: string; targetUrl: string }; createdSlug?: string }`
  - `createLinkAction(previous: LinkFormState, formData: FormData): Promise<LinkFormState>`, a server action.
  - `<CopyButton value={string} label?={string} />`
  - `<CreateLinkForm shortUrl={string} />`
  - `<LinksTable links={LinkRow[]} shortUrl={string} query={string} />`

- [ ] **Step 1: Write the failing test `src/lib/format.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("formats in Stockholm time as YYYY-MM-DD HH:MM", () => {
    expect(formatDateTime(new Date("2026-01-15T12:34:00Z"))).toBe("2026-01-15 13:34");
    expect(formatDateTime(new Date("2026-07-01T12:34:00Z"))).toBe("2026-07-01 14:34");
  });

  it("shows a dash for missing dates", () => {
    expect(formatDateTime(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL, because `./format` cannot be resolved.

- [ ] **Step 3: Implement `src/lib/format.ts`**

```ts
const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

/** "2026-01-15 13:34" in Stockholm time, or "—" when there is no date. */
export function formatDateTime(date: Date | null): string {
  return date ? dateTimeFormat.format(date) : "—";
}
```

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 4: Server action `src/lib/links/actions.ts`**

A `"use server"` file may export only async functions and types. `requireUser()` stays outside `try`, because its `redirect()` works by throwing.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createLink, type FieldErrors } from "./service";

export interface LinkFormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Submitted values, echoed back on error so the form keeps them. */
  values?: { slug: string; targetUrl: string };
  /** Set after a successful create. */
  createdSlug?: string;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createLinkAction(_previous: LinkFormState, formData: FormData): Promise<LinkFormState> {
  const user = await requireUser();
  const values = { slug: readField(formData, "slug"), targetUrl: readField(formData, "targetUrl") };
  try {
    const result = await createLink(getDb(), { userId: user.id, ...values, shortUrl: getEnv().shortUrl });
    if (!result.ok) return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
    revalidatePath("/");
    return { status: "success", createdSlug: result.slug };
  } catch (error) {
    console.error("createLinkAction failed", error);
    return { status: "error", message: GENERIC_ERROR, values };
  }
}
```

- [ ] **Step 5: Copy button `src/components/copy-button.tsx`**

```tsx
"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={label} title={label}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
```

- [ ] **Step 6: Create form `src/components/create-link-form.tsx`**

After an action, React 19 resets the form to each input's `defaultValue`. On error the action echoes `values` back, so the input is kept; on success the form clears.

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLinkAction, type LinkFormState } from "@/lib/links/actions";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";
import { cn } from "@/lib/utils";

const initialState: LinkFormState = { status: "idle" };

export function CreateLinkForm({ shortUrl }: { shortUrl: string }) {
  const [state, formAction, pending] = useActionState(createLinkAction, initialState);
  const slugError = state.fieldErrors?.slug;
  const targetError = state.fieldErrors?.targetUrl;

  useEffect(() => {
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
        <div className="grid gap-1.5">
          <Label htmlFor="slug">Short link</Label>
          <div
            className={cn(
              "flex h-8 items-center rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50",
              slugError && "border-destructive",
            )}
          >
            <span className="pl-2.5 text-sm text-muted-foreground">{new URL(shortUrl).host}/</span>
            <Input
              id="slug"
              name="slug"
              placeholder="random"
              autoComplete="off"
              spellCheck={false}
              defaultValue={state.values?.slug}
              aria-invalid={slugError ? true : undefined}
              aria-describedby={slugError ? "slug-error" : undefined}
              className="h-full flex-1 rounded-none border-0 bg-transparent pl-0.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {slugError && (
            <p id="slug-error" className="text-sm text-destructive">
              {slugError}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetUrl">Destination URL</Label>
          <Input
            id="targetUrl"
            name="targetUrl"
            type="url"
            required
            placeholder="https://…"
            defaultValue={state.values?.targetUrl}
            aria-invalid={targetError ? true : undefined}
            aria-describedby={targetError ? "target-error" : undefined}
          />
          {targetError && (
            <p id="target-error" className="text-sm text-destructive">
              {targetError}
            </p>
          )}
        </div>
        <Button type="submit" disabled={pending} className="sm:mt-6">
          {pending ? "Creating…" : "Create link"}
        </Button>
      </form>
      {state.status === "success" && state.createdSlug && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span>Created</span>
          <a
            href={shortLinkUrl(shortUrl, state.createdSlug)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {shortLinkLabel(shortUrl, state.createdSlug)}
          </a>
          <CopyButton value={shortLinkUrl(shortUrl, state.createdSlug)} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Links table `src/components/links-table.tsx`**

```tsx
import { QrCodeIcon } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { LinkRow } from "@/lib/links/repository";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";

export function LinksTable({ links, shortUrl, query }: { links: LinkRow[]; shortUrl: string; query: string }) {
  if (links.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {query ? `No links match “${query}”.` : "No links yet. Create the first one above."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Short link</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead>Last clicked</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>
            <span className="sr-only">QR code and settings</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => {
          const label = shortLinkLabel(shortUrl, link.slug);
          return (
            <TableRow key={link.slug}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-1">
                  <Link href={`/links/${link.slug}`} className="hover:underline">
                    {label}
                  </Link>
                  <CopyButton value={shortLinkUrl(shortUrl, link.slug)} />
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-72 truncate">
                  <a
                    href={link.targetUrl}
                    title={link.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:underline"
                  >
                    {link.targetUrl}
                  </a>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{link.clickCount}</TableCell>
              <TableCell>{formatDateTime(link.lastClickedAt)}</TableCell>
              <TableCell>{link.createdByName ?? "—"}</TableCell>
              <TableCell>{formatDateTime(link.updatedAt)}</TableCell>
              <TableCell>
                <Link
                  href={`/links/${link.slug}`}
                  aria-label={`QR code and settings for ${label}`}
                  title="QR code and settings"
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                >
                  <QrCodeIcon />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 8: Dashboard page**

Replace `src/app/(dashboard)/page.tsx`:

```tsx
import Form from "next/form";
import { CreateLinkForm } from "@/components/create-link-form";
import { LinksTable } from "@/components/links-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { listLinks } from "@/lib/links/repository";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const { shortUrl } = getEnv();
  const links = await listLinks(getDb(), { query });

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Create a short link</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateLinkForm shortUrl={shortUrl} />
        </CardContent>
      </Card>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">All links</h2>
          <Form action="/" className="flex gap-2">
            <Input
              name="q"
              type="search"
              placeholder="Search slug or URL"
              defaultValue={query}
              aria-label="Search links"
              className="w-64"
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </Form>
        </div>
        <LinksTable links={links} shortUrl={shortUrl} query={query} />
      </section>
    </div>
  );
}
```

- [ ] **Step 9: Verify**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all pass. The build lists `ƒ /` (dynamic).

Human check (needs Google credentials): sign in; create `ktha.is/test-1 → https://example.com`; the success panel shows the link with a copy button and the table lists it. Create it again and see `short.localhost:3000/test-1 is already taken.` inline, with the destination field still filled. Leave the slug blank and a 6-character slug is generated. Search `EXAMPLE` and the row is found; search `%` and it isn't.

- [ ] **Step 10: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/lib/links/actions.ts src/components/copy-button.tsx \
  src/components/create-link-form.tsx src/components/links-table.tsx src/app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard for creating and searching links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Edit and delete links

**Files:**
- Create: `src/components/edit-link-form.tsx`, `src/components/delete-link-button.tsx`, `src/app/(dashboard)/links/[slug]/page.tsx`
- Modify: `src/lib/links/actions.ts`

**Interfaces:**
- Consumes: `updateLink`, `removeLink` (Task 6); `getLink` (Task 5); `LinkFormState`, `readField`, `GENERIC_ERROR` (Task 9, same file); `CopyButton` (Task 9); `formatDateTime` (Task 9).
- Produces:
  - `updateLinkAction(slug: string, previous: LinkFormState, formData: FormData): Promise<LinkFormState>`
  - `deleteLinkAction(slug: string): Promise<LinkFormState>` redirects to `/` on success.
  - `<EditLinkForm action={(state, formData) => Promise<LinkFormState>} targetUrl={string} />`
  - `<DeleteLinkButton action={() => Promise<LinkFormState>} label={string} />`
  - The page `/links/[slug]`.

- [ ] **Step 1: Add the update and delete actions**

In `src/lib/links/actions.ts`, replace the imports block with:

```ts
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createLink, removeLink, updateLink, type FieldErrors } from "./service";
```

and append at the end of the file:

```ts
export async function updateLinkAction(
  slug: string,
  _previous: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const user = await requireUser();
  const values = { slug, targetUrl: readField(formData, "targetUrl") };
  try {
    const result = await updateLink(getDb(), {
      userId: user.id,
      slug,
      targetUrl: values.targetUrl,
      shortUrl: getEnv().shortUrl,
    });
    if (!result.ok) return { status: "error", message: result.message, fieldErrors: result.fieldErrors, values };
    revalidatePath("/");
    revalidatePath(`/links/${slug}`);
    return { status: "success", message: "Saved." };
  } catch (error) {
    console.error("updateLinkAction failed", error);
    return { status: "error", message: GENERIC_ERROR, values };
  }
}

export async function deleteLinkAction(slug: string): Promise<LinkFormState> {
  await requireUser();
  let result;
  try {
    result = await removeLink(getDb(), slug);
  } catch (error) {
    console.error("deleteLinkAction failed", error);
    return { status: "error", message: GENERIC_ERROR };
  }
  revalidatePath("/");
  if (!result.ok) return { status: "error", message: result.message };
  redirect("/"); // Outside try: redirect() works by throwing.
}
```

- [ ] **Step 2: Edit form `src/components/edit-link-form.tsx`**

```tsx
"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LinkFormState } from "@/lib/links/actions";

const initialState: LinkFormState = { status: "idle" };

export function EditLinkForm({
  action,
  targetUrl,
}: {
  action: (state: LinkFormState, formData: FormData) => Promise<LinkFormState>;
  targetUrl: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const targetError = state.fieldErrors?.targetUrl;

  useEffect(() => {
    if (state.status === "success" && state.message) toast.success(state.message);
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="targetUrl">Destination URL</Label>
        <Input
          id="targetUrl"
          name="targetUrl"
          type="url"
          required
          defaultValue={state.values?.targetUrl ?? targetUrl}
          aria-invalid={targetError ? true : undefined}
          aria-describedby={targetError ? "target-error" : undefined}
        />
        {targetError && (
          <p id="target-error" className="text-sm text-destructive">
            {targetError}
          </p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="sm:mt-6">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Delete button `src/components/delete-link-button.tsx`**

```tsx
"use client";

import { Trash2Icon } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { LinkFormState } from "@/lib/links/actions";

const initialState: LinkFormState = { status: "idle" };

export function DeleteLinkButton({ action, label }: { action: () => Promise<LinkFormState>; label: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "error" && state.message) toast.error(state.message);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2Icon />
        Delete link
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone who opens this link or scans its QR code will see “Link not found”. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Edit page `src/app/(dashboard)/links/[slug]/page.tsx`**

```tsx
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { DeleteLinkButton } from "@/components/delete-link-button";
import { EditLinkForm } from "@/components/edit-link-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { deleteLinkAction, updateLinkAction } from "@/lib/links/actions";
import { getLink } from "@/lib/links/repository";
import { shortLinkLabel, shortLinkUrl } from "@/lib/links/short-url";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

function byline(name: string | null): string {
  return name ? ` by ${name}` : "";
}

export default async function LinkPage({ params }: PageProps<"/links/[slug]">) {
  await requireUser();
  const slug = normalizeSlug((await params).slug);
  if (!isValidSlug(slug)) notFound();
  const link = await getLink(getDb(), slug);
  if (!link) notFound();

  const { shortUrl } = getEnv();
  const url = shortLinkUrl(shortUrl, slug);
  const label = shortLinkLabel(shortUrl, slug);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm", className: "self-start" })}>
        <ArrowLeftIcon />
        All links
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{label}</h1>
        <CopyButton value={url} />
      </div>
      <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Destination</CardTitle>
            </CardHeader>
            <CardContent>
              <EditLinkForm action={updateLinkAction.bind(null, slug)} targetUrl={link.targetUrl} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Clicks</dt>
                <dd className="tabular-nums">{link.clickCount}</dd>
                <dt className="text-muted-foreground">Last clicked</dt>
                <dd>{formatDateTime(link.lastClickedAt)}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>
                  {formatDateTime(link.createdAt)}
                  {byline(link.createdByName)}
                </dd>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd>
                  {formatDateTime(link.updatedAt)}
                  {byline(link.updatedByName)}
                </dd>
              </dl>
            </CardContent>
          </Card>
          <div>
            <DeleteLinkButton action={deleteLinkAction.bind(null, slug)} label={label} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all pass; the build lists `ƒ /links/[slug]`.

Human check (needs Google credentials): open a link from the table. Change its destination and get a "Saved." toast; the new target shows after reload. Enter `https://short.localhost:3000/x` and the inline error `Links can't point to short.localhost itself.` appears. Delete → confirm → you land on the dashboard and the link is gone. In a second tab, delete a link, then save it in the first tab: toast `This link no longer exists.`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/links/actions.ts src/components/edit-link-form.tsx src/components/delete-link-button.tsx \
  src/app/\(dashboard\)/links
git commit -m "feat: add editing and deleting of links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: QR codes

**Files:**
- Create: `src/lib/links/qr.ts`, `src/lib/links/qr.test.ts`, `src/app/api/qr/[slug]/route.ts`, `src/components/qr-code-card.tsx`
- Modify: `src/app/(dashboard)/links/[slug]/page.tsx`, `package.json`

**Interfaces:**
- Consumes: `requireUser` (Task 8); `getDb` (Task 4); `getEnv` (Task 2); `getLink` (Task 5); `shortLinkUrl`, `normalizeSlug`, `isValidSlug` (Task 3); `buttonVariants`, `Card*` (Task 1).
- Produces:
  - `QR_FORMATS = ["svg", "png"] as const`, `type QrFormat`, `QR_PNG_WIDTH = 1024`
  - `isQrFormat(value: string): value is QrFormat`
  - `renderQrSvg(text: string): Promise<string>`
  - `renderQrPng(text: string): Promise<Uint8Array<ArrayBuffer>>`
  - `qrFilename(shortUrl: string, slug: string, format: QrFormat): string` returns `"ktha.is-apply.svg"`.
  - `GET /api/qr/[slug]?format=svg|png`
  - `<QrCodeCard slug={string} url={string} />`

- [ ] **Step 1: Install qrcode**

```bash
npm install qrcode@1.5.4
npm install --save-dev @types/qrcode@^1.5
```

- [ ] **Step 2: Write the failing test `src/lib/links/qr.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isQrFormat, QR_PNG_WIDTH, qrFilename, renderQrPng, renderQrSvg } from "./qr";

describe("renderQrSvg", () => {
  it("renders a standalone SVG document", async () => {
    const svg = await renderQrSvg("https://ktha.is/apply");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("encodes different URLs differently", async () => {
    expect(await renderQrSvg("https://ktha.is/a")).not.toBe(await renderQrSvg("https://ktha.is/b"));
  });
});

describe("renderQrPng", () => {
  it("renders a square PNG of the configured width", async () => {
    const png = await renderQrPng("https://ktha.is/apply");
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(QR_PNG_WIDTH); // IHDR width
    expect(view.getUint32(20)).toBe(QR_PNG_WIDTH); // IHDR height
  });
});

describe("isQrFormat", () => {
  it.each(["svg", "png"])("accepts %s", (format) => {
    expect(isQrFormat(format)).toBe(true);
  });

  it.each(["jpg", "SVG", ""])("rejects %j", (format) => {
    expect(isQrFormat(format)).toBe(false);
  });
});

describe("qrFilename", () => {
  it("names the file after the short link", () => {
    expect(qrFilename("https://ktha.is", "apply", "svg")).toBe("ktha.is-apply.svg");
    expect(qrFilename("http://short.localhost:3000", "apply", "png")).toBe("short.localhost-apply.png");
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npm run test:unit`
Expected: FAIL, because `./qr` cannot be resolved.

- [ ] **Step 4: Implement `src/lib/links/qr.ts`**

```ts
import QRCode from "qrcode";

export const QR_FORMATS = ["svg", "png"] as const;
export type QrFormat = (typeof QR_FORMATS)[number];
export const QR_PNG_WIDTH = 1024;

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 4 } as const;

export function isQrFormat(value: string): value is QrFormat {
  return (QR_FORMATS as readonly string[]).includes(value);
}

export function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...QR_OPTIONS, type: "svg" });
}

export async function renderQrPng(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await QRCode.toBuffer(text, { ...QR_OPTIONS, type: "png", width: QR_PNG_WIDTH });
  return new Uint8Array(buffer);
}

/** Download filename, e.g. "ktha.is-apply.svg". */
export function qrFilename(shortUrl: string, slug: string, format: QrFormat): string {
  return `${new URL(shortUrl).hostname}-${slug}.${format}`;
}
```

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Download route `src/app/api/qr/[slug]/route.ts`**

```ts
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isQrFormat, qrFilename, renderQrPng, renderQrSvg } from "@/lib/links/qr";
import { getLink } from "@/lib/links/repository";
import { shortLinkUrl } from "@/lib/links/short-url";
import { isValidSlug, normalizeSlug } from "@/lib/links/validation";

export async function GET(request: NextRequest, { params }: RouteContext<"/api/qr/[slug]">) {
  await requireUser();
  const slug = normalizeSlug((await params).slug);
  const format = request.nextUrl.searchParams.get("format") ?? "svg";
  if (!isQrFormat(format)) return new Response("Unknown format. Use svg or png.", { status: 400 });
  if (!isValidSlug(slug) || !(await getLink(getDb(), slug))) return new Response("Link not found.", { status: 404 });

  const { shortUrl } = getEnv();
  // Encode the short link, not the target: scans are counted and the target can change without reprinting.
  const text = shortLinkUrl(shortUrl, slug);
  const headers = {
    "Content-Disposition": `attachment; filename="${qrFilename(shortUrl, slug, format)}"`,
    "Cache-Control": "private, no-store",
  };
  if (format === "svg") {
    return new Response(await renderQrSvg(text), { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  }
  return new Response(await renderQrPng(text), { headers: { ...headers, "Content-Type": "image/png" } });
}
```

- [ ] **Step 6: QR card `src/components/qr-code-card.tsx`**

```tsx
import { DownloadIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { renderQrSvg } from "@/lib/links/qr";

export async function QrCodeCard({ slug, url }: { slug: string; url: string }) {
  // Markup generated by the qrcode library from our own URL; it contains no user-supplied HTML.
  const svg = await renderQrSvg(url);

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR code</CardTitle>
        <CardDescription>
          Opens {url}, so scans are counted and you can change the destination without reprinting.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div
          role="img"
          aria-label={`QR code for ${url}`}
          className="aspect-square w-full max-w-56 overflow-hidden rounded-lg bg-white [&_svg]:block [&_svg]:size-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="flex gap-2">
          <a href={`/api/qr/${slug}?format=svg`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
            <DownloadIcon />
            SVG (print)
          </a>
          <a href={`/api/qr/${slug}?format=png`} download className={buttonVariants({ variant: "outline", size: "sm" })}>
            <DownloadIcon />
            PNG
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Show the card on the edit page**

In `src/app/(dashboard)/links/[slug]/page.tsx`, add the import:

```tsx
import { QrCodeCard } from "@/components/qr-code-card";
```

and replace this block (the end of the two-column grid):

```tsx
          <div>
            <DeleteLinkButton action={deleteLinkAction.bind(null, slug)} label={label} />
          </div>
        </div>
      </div>
```

with:

```tsx
          <div>
            <DeleteLinkButton action={deleteLinkAction.bind(null, slug)} label={label} />
          </div>
        </div>
        <QrCodeCard slug={slug} url={url} />
      </div>
```

- [ ] **Step 8: Verify**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Start `npm run dev` in the background and check the unauthenticated behaviour:

```bash
curl -s -o /dev/null -w '%{http_code} %header{location}\n' 'http://localhost:3000/api/qr/hello?format=png'
```

Expected: `307 /login`. Stop the server: `lsof -ti tcp:3000 | xargs kill`.

Human check (needs Google credentials): on a link's page the QR code is shown. Both downloads save `short.localhost-<slug>.svg` / `.png`, and scanning with a phone opens `http://short.localhost:3000/<slug>`. That URL only resolves on the computer itself, so for a real scan test use the production deployment.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/links/qr.ts src/lib/links/qr.test.ts src/app/api/qr \
  src/components/qr-code-card.tsx src/app/\(dashboard\)/links
git commit -m "feat: add QR code preview and downloads" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Docker image and standalone smoke test

**Files:**
- Create: `.dockerignore`, `scripts/smoke.mjs`
- Modify: `docker-compose.yaml`, `package.json`

**Interfaces:**
- Consumes: the whole app (Tasks 1–11); the existing `Dockerfile`, unchanged.
- Produces:
  - `npm run smoke` runs the standalone server against `DB_URL` and checks routing over HTTP. The optional env var `SMOKE_HOSTNAME` (default `0.0.0.0`) and `SMOKE_PORT` (default `3100`) can be set.
  - The `app` service in docker-compose.

- [ ] **Step 1: Keep secrets and build output out of the image**

Create `.dockerignore`:

```gitignore
.git
.github
.next
node_modules
coverage
docs
*.tsbuildinfo
npm-debug.log*
.DS_Store
.env
.env.*
!.env.example
```

- [ ] **Step 2: Write the smoke test `scripts/smoke.mjs`**

```js
// Smoke test for the production build. Starts .next/standalone/server.js against a real Postgres and
// checks host routing over HTTP with real Host headers. Unit tests can't see rewrite-level failures.
// Usage: npm run build && npm run smoke   (needs the variables from .env.example)
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import http from "node:http";
import pg from "pg";

const REQUIRED = [
  "DB_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "APP_URL",
  "SHORT_URL",
  "ROOT_REDIRECT_URL",
];
const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const HOSTNAME = process.env.SMOKE_HOSTNAME ?? "0.0.0.0";
const SLUG = "smoke-test";
const TARGET = "https://example.com/smoke";

function request(host, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path, method: "GET", headers: { host } }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? null }));
    });
    req.on("error", reject);
    req.end();
  });
}

function matchesLocation(actual, expected) {
  if (actual === null) return false;
  // Relative expectations ("/login") compare paths; absolute ones must match exactly.
  return expected.startsWith("/") ? new URL(actual, "http://placeholder").pathname === expected : actual === expected;
}

function startServer() {
  if (!existsSync(".next/standalone/server.js")) throw new Error("No standalone build. Run `npm run build` first.");
  // Mirror the Dockerfile: static assets and public/ are not part of the standalone output.
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  cpSync("public", ".next/standalone/public", { recursive: true });
  const server = spawn(process.execPath, [".next/standalone/server.js"], {
    env: { ...process.env, PORT: String(PORT), HOSTNAME, NODE_ENV: "production" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  server.exited = false;
  server.on("exit", () => {
    server.exited = true;
  });
  return server;
}

async function waitForServer(server, appHost) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exited) throw new Error("The server exited during startup (see its output above).");
    try {
      await request(appHost, "/login");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("The server did not start within 30 seconds.");
}

async function main() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

  const appHost = new URL(process.env.APP_URL).host;
  const shortHost = new URL(process.env.SHORT_URL).host;
  const rootRedirect = new URL(process.env.ROOT_REDIRECT_URL).href;
  const checks = [
    ["short-host root redirects to ROOT_REDIRECT_URL", shortHost, "/", 307, rootRedirect],
    ["slug redirects to its target", shortHost, `/${SLUG}`, 307, TARGET],
    ["slugs are case-insensitive", shortHost, `/${SLUG.toUpperCase()}`, 307, TARGET],
    ["unknown slug is 404", shortHost, "/no-such-link-xyz", 404, null],
    ["multi-segment path on the short host is 404", shortHost, "/a/b", 404, null],
    ["redirect route is hidden on the app host", appHost, `/r/${SLUG}`, 404, null],
    ["login page renders on the app host", appHost, "/login", 200, null],
    ["dashboard requires sign-in", appHost, "/", 307, "/login"],
    ["QR download requires sign-in", appHost, `/api/qr/${SLUG}`, 307, "/login"],
  ];

  const server = startServer();
  const pool = new pg.Pool({ connectionString: process.env.DB_URL });
  let failures = 0;
  try {
    await waitForServer(server, appHost); // Migrations have run once the server answers.
    await pool.query(
      `INSERT INTO links (slug, target_url) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET target_url = EXCLUDED.target_url, click_count = 0, last_clicked_at = NULL`,
      [SLUG, TARGET],
    );

    for (const [name, host, path, status, location] of checks) {
      const res = await request(host, path);
      const ok = res.status === status && (location === null || matchesLocation(res.location, location));
      console.log(`${ok ? "✓" : "✗"} ${name} (${host}${path} → ${res.status}${res.location ? ` ${res.location}` : ""})`);
      if (!ok) failures += 1;
    }

    const { rows } = await pool.query("SELECT click_count FROM links WHERE slug = $1", [SLUG]);
    const clicks = rows[0]?.click_count;
    console.log(`${clicks === 2 ? "✓" : "✗"} clicks are counted (click_count = ${clicks}, expected 2)`);
    if (clicks !== 2) failures += 1;
  } finally {
    await pool.query("DELETE FROM links WHERE slug = $1", [SLUG]).catch(() => {});
    await pool.end();
    server.kill();
  }
  if (failures > 0) throw new Error(`${failures} smoke check(s) failed.`);
}

main().then(
  () => console.log("All smoke checks passed."),
  (error) => {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  },
);
```

```bash
npm pkg set scripts.smoke="node --env-file-if-exists=.env scripts/smoke.mjs"
```

- [ ] **Step 3: Run the smoke test**

```bash
docker compose up -d --wait db
npm run build && npm run smoke
```

Expected: ten `✓` lines, then `All smoke checks passed.`.

- [ ] **Step 4: Watch it catch the loopback-HOSTNAME failure (Review Focus 1)**

```bash
SMOKE_HOSTNAME=127.0.0.1 npm run smoke; echo "exit=$?"
```

Expected: the slug checks fail (`→ 404` instead of `307`) and the exit status is non-zero. This proves the smoke test catches rewrites that go external. Keep `HOSTNAME=0.0.0.0` in every deployment.

- [ ] **Step 5: Add the app service to docker-compose**

In `docker-compose.yaml`, add under `services:` (after the `db` service, before the top-level `volumes:`):

```yaml
  app:
    build: .
    env_file:
      - path: .env
        required: false
    environment:
      # Inside the compose network the database is reachable as "db", not localhost.
      DB_URL: postgres://kortslutning:kortslutning@db:5432/kortslutning
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy
```

- [ ] **Step 6: Verify the Docker image**

Stop any dev server on port 3000 first (`lsof -ti tcp:3000 | xargs kill`), then:

```bash
docker compose up -d --build --wait app
# The container is "running" before the server has migrated and started listening; wait for it.
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3000/login && break; sleep 1; done
curl -s -o /dev/null -w '%{http_code} %header{location}\n' -H 'Host: short.localhost:3000' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
docker compose run --rm --no-deps --entrypoint ls app -a /app
docker compose stop app
```

Expected: `307 https://kthais.com/`, then `200`, then a listing with `drizzle`, `server.js`, `public`, `.next`, `node_modules` and no `.env` file.

- [ ] **Step 7: Commit**

```bash
git add .dockerignore scripts/smoke.mjs docker-compose.yaml package.json
git commit -m "test: add standalone smoke test and compose app service" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: npm scripts `lint`, `typecheck`, `test`, `build`, `smoke`; `Dockerfile`.
- Produces: CI on pushes to `main` and on pull requests.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: kortslutning
          POSTGRES_PASSWORD: kortslutning
          POSTGRES_DB: kortslutning_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U kortslutning -d kortslutning_test"
          --health-interval 2s
          --health-timeout 5s
          --health-retries 30
    env:
      TEST_DB_URL: postgres://kortslutning:kortslutning@localhost:5432/kortslutning_test
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      # No app environment variables here, exactly like the Docker build.
      - run: npm run build
      - name: Smoke test the standalone server
        run: npm run smoke
        env:
          DB_URL: postgres://kortslutning:kortslutning@localhost:5432/kortslutning_test
          GOOGLE_CLIENT_ID: ci-placeholder
          GOOGLE_CLIENT_SECRET: ci-placeholder
          BETTER_AUTH_SECRET: ci-placeholder-secret-at-least-32-characters
          APP_URL: http://localhost:3000
          SHORT_URL: http://short.localhost:3000
          ROOT_REDIRECT_URL: https://kthais.com

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker build --tag kortslutning:ci .
```

- [ ] **Step 2: Lint the workflow**

```bash
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:latest -color
```

Expected: no output and exit status 0.

- [ ] **Step 3: Rehearse the CI job locally**

```bash
rm -rf .next
docker compose up -d --wait db
npm ci && npm run lint && npm run typecheck && npm test
mv .env .env.off; npm run build; status=$?; mv .env.off .env; test $status -eq 0
npm run smoke
docker build --tag kortslutning:ci .
```

Expected: every command succeeds.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, test, build, smoke and docker jobs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The workflow runs on GitHub only after a push. Pushing is outward-facing: ask the user before pushing the branch or opening a PR.

---

### Task 14: Documentation

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the user-facing documentation, including the manual Google Cloud step the user asked to have documented.

- [ ] **Step 1: Write `README.md`**

````markdown
# kortslutning

The URL shortener for KTH AI Society.

- **`ktha.is/<slug>`** is public and redirects visitors (HTTP 307) to the link's destination.
- **`app.ktha.is`** is the dashboard. Anyone with an `@kthais.com` Google account can sign in and create, edit, delete and download QR codes for short links. Every member can manage every link; the dashboard records who created and last changed each one.

One Next.js app serves both hostnames and decides what to do from the request's `Host` header.
The design is in [`docs/superpowers/specs/2026-09-29-url-shortener-design.md`](docs/superpowers/specs/2026-09-29-url-shortener-design.md).

## Local development

Prerequisites: Node.js 22, Docker, and (for signing in) a Google OAuth client, see [Google Cloud OAuth setup](#google-cloud-oauth-setup).

```bash
npm install
cp .env.example .env                 # then fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET
openssl rand -base64 32              # a value for BETTER_AUTH_SECRET
docker compose up -d --wait db       # PostgreSQL 18 on localhost:5432 (+ the kortslutning_test database)
npm run dev
```

- Dashboard: <http://localhost:3000> (use `localhost`, not `127.0.0.1`: sign-in is tied to `APP_URL`)
- Short links: `http://short.localhost:3000/<slug>`. Browsers resolve `*.localhost` to your machine, so there is nothing to add to `/etc/hosts`.

Migrations in `drizzle/` are applied automatically when the server starts. After changing `src/lib/db/schema.ts`, generate a new migration with `npm run db:generate` and commit it.

To run the production image locally: `docker compose up --build` (stop `npm run dev` first; both use port 3000).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server (needs `.env` and the `db` service) |
| `npm run build` | Production build (`.next/standalone`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and integration tests (integration tests need the `db` service) |
| `npm run test:unit` / `npm run test:int` | One project only |
| `npm run smoke` | Starts the built standalone server and checks routing over HTTP (run `npm run build` first) |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:migrate` | Apply migrations manually (the app also does this at startup) |

## Environment variables

The app validates these at startup and refuses to start, naming the problem, if any is missing or invalid.

| Variable | Production example | Purpose |
|---|---|---|
| `DB_URL` | `postgres://user:pass@host:5432/kortslutning` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth client secret |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` | Signs session cookies (at least 32 characters) |
| `APP_URL` | `https://app.ktha.is` | Dashboard origin; also the sign-in base URL |
| `SHORT_URL` | `https://ktha.is` | Short-link origin; used for routing, display, copying and QR codes |
| `ROOT_REDIRECT_URL` | `https://kthais.com` | Where `https://ktha.is/` (no slug) redirects |
| `TEST_DB_URL` | | Tests only: the integration-test database |

## Google Cloud OAuth setup

This is a one-time manual step. You need access to a Google Cloud project, ideally one inside the kthais.com Google Workspace organization.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select or create a project that belongs to the **kthais.com** organization.
2. Go to **Google Auth Platform** (APIs & Services → OAuth consent screen).
   - **Branding:** app name `ktha.is`, a support email, and optionally the KTH AI Society logo.
   - **Audience:** choose **Internal**. Google then only lets kthais.com Workspace accounts sign in, on top of the app's own checks. (Internal is only available for projects inside a Workspace organization.)
   - **Data access:** no extra scopes are needed. Sign-in uses `openid`, `email` and `profile`.
3. Go to **Clients → Create client**.
   - Application type: **Web application**, name `ktha.is dashboard`.
   - **Authorized redirect URIs**:
     - `https://app.ktha.is/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google` (local development)
4. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: your local `.env` for development, and the production secret store for the deployment. You can also create a separate client for local development.

The app restricts sign-in to `@kthais.com` itself as well: it asks Google for the `kthais.com` hosted domain and verifies the ID token's `hd` claim, and it refuses to create a user unless the verified email ends in `@kthais.com`.

## Deployment

The image is built from the `Dockerfile` (Next.js standalone output, Node.js 22):

```bash
docker build -t kortslutning .
docker run -p 3000:3000 --env-file production.env kortslutning
```

- **DNS:** point both `ktha.is` and `app.ktha.is` at the container, or at the reverse proxy in front of it.
- **Reverse proxy:** pass the original `Host` header through unchanged; routing depends on it. Terminate TLS for both names.
- **`HOSTNAME`:** keep the Dockerfile's `HOSTNAME=0.0.0.0`. With a loopback value such as `127.0.0.1`, Next.js treats the app's internal rewrites as external requests and **every short link returns 404**.
- **Database:** PostgreSQL 14 or newer. Migrations run automatically at startup, so run a single instance (or make sure only one starts at a time).
- **Secrets:** generate `BETTER_AUTH_SECRET` once (`openssl rand -base64 32`) and keep it stable; changing it signs everyone out.
- `.dockerignore` keeps `.env` files out of the image; configuration comes only from the runtime environment.

## Testing

- **Unit tests** (`*.test.ts`): slug and URL rules, host routing, env parsing, the email-domain check, QR rendering.
- **Integration tests** (`*.int.test.ts`): the link repository and service against PostgreSQL (`TEST_DB_URL`).
- **Smoke test** (`npm run smoke`): the real standalone server, checked over HTTP with real `Host` headers.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck, tests, an environment-less build (like the Docker build), the smoke test, and a Docker build.

Manual checklist (needs a real Google OAuth client):

- [ ] Signing in with an `@kthais.com` account opens the dashboard.
- [ ] Signing in with any other Google account ends on `/login` with "Only @kthais.com accounts can sign in."
- [ ] A new link redirects on the short domain, and its click count goes up.
- [ ] The QR SVG and PNG download, and scanning opens the short link.

## Troubleshooting

- **Every short link returns 404 in production:** check `HOSTNAME` (see Deployment) and that the proxy forwards `Host`.
- **`Invalid environment configuration` at startup:** the message names the variable; compare with `.env.example`.
- **`TEST_DB_URL is not set` / `ECONNREFUSED` in tests:** run `docker compose up -d --wait db` and make sure `.env` exists.
- **Port 5432 already in use:** stop the other PostgreSQL server, or change the host port in `docker-compose.yaml` and the URLs in `.env`.
````

- [ ] **Step 2: Add project notes to `CLAUDE.md`**

Replace `CLAUDE.md` (keeping the `@AGENTS.md` include that `create-next-app` generated):

```markdown
@AGENTS.md

# kortslutning

URL shortener for KTH AI Society: public redirects on ktha.is, dashboard on app.ktha.is. Design: `docs/superpowers/specs/2026-09-29-url-shortener-design.md`.

- npm only (`package-lock.json`); conventional commits (`feat:`, `fix:`, `docs:`, …).
- Host routing is `src/lib/routing.ts` (pure, unit tested) + `src/proxy.ts`. After changing either, also run `npm run build && npm run smoke`.
- Never read environment variables at module top level; use `getEnv()`, `getDb()`, `getAuth()`. The Docker build has no env.
- Every page, server action and route handler that needs a user calls `requireUser()` first.
- Schema changes: edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the SQL in `drizzle/`.
- Verify: `npm run lint && npm run typecheck && npm test && npm run build`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document setup, Google OAuth, deployment and testing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full check from a clean build:

```bash
rm -rf .next && docker compose up -d --wait db
npm run lint && npm run typecheck && npm test && npm run build && npm run smoke
git status --short   # expect a clean tree
```

- [ ] Hand the README's manual checklist (real Google sign-in, domain rejection, QR scan) to the user. It needs their OAuth client and cannot be automated.
