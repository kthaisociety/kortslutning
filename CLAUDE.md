@AGENTS.md

# kortslutning

URL shortener for KTH AI Society: public redirects on ktha.is, dashboard on app.ktha.is. Design: `docs/superpowers/specs/2026-09-29-url-shortener-design.md`.

- npm only (`package-lock.json`); conventional commits (`feat:`, `fix:`, `docs:`, …).
- Host routing is `src/lib/routing.ts` (pure, unit tested) + `src/proxy.ts`. After changing either, also run `npm run build && npm run smoke`.
- Never read environment variables at module top level; use `getEnv()`, `getDb()`, `getAuth()`. The Docker build has no env.
- Every page, server action and route handler that needs a user calls `requireUser()` first.
- Schema changes: edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the SQL in `drizzle/`.
- Verify: `npm run lint && npm run typecheck && npm test && npm run build`.
