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

| Command                                  | What it does                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run dev`                            | Development server (needs `.env` and the `db` service)                                      |
| `npm run build`                          | Production build (`.next/standalone`)                                                       |
| `npm run lint` / `npm run typecheck`     | ESLint / TypeScript                                                                         |
| `npm test`                               | Unit and integration tests (integration tests need the `db` service)                        |
| `npm run test:unit` / `npm run test:int` | One project only                                                                            |
| `npm run smoke`                          | Starts the built standalone server and checks routing over HTTP (run `npm run build` first) |
| `npm run db:generate`                    | Generate a SQL migration from the schema                                                    |
| `npm run db:migrate`                     | Apply migrations manually (the app also does this at startup)                               |

## Environment variables

The app validates these at startup and refuses to start, naming the problem, if any is missing or invalid.

| Variable               | Production example                            | Purpose                                                            |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `DB_URL`               | `postgres://user:pass@host:5432/kortslutning` | PostgreSQL connection string                                       |
| `GOOGLE_CLIENT_ID`     | `…apps.googleusercontent.com`                 | Google OAuth client ID                                             |
| `GOOGLE_CLIENT_SECRET` |                                               | Google OAuth client secret                                         |
| `BETTER_AUTH_SECRET`   | output of `openssl rand -base64 32`           | Signs session cookies (at least 32 characters)                     |
| `APP_URL`              | `https://app.ktha.is`                         | Dashboard origin; also the sign-in base URL                        |
| `SHORT_URL`            | `https://ktha.is`                             | Short-link origin; used for routing, display, copying and QR codes |
| `ROOT_REDIRECT_URL`    | `https://kthais.com`                          | Where `https://ktha.is/` (no slug) redirects                       |
| `TEST_DB_URL`          |                                               | Tests only: the integration-test database                          |

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
docker run -p 3000:3000 --env-file /etc/kortslutning/production.env kortslutning   # keep this file outside the repository
```

- **DNS:** point both `ktha.is` and `app.ktha.is` at the container, or at the reverse proxy in front of it.
- **Reverse proxy:** pass the original `Host` header through unchanged; routing depends on it. Terminate TLS for both names.
- **`HOSTNAME`:** keep the Dockerfile's `HOSTNAME=0.0.0.0`. With a loopback value such as `127.0.0.1`, Next.js treats the app's internal rewrites as external requests and **every short link returns 404**.
- **Database:** PostgreSQL 14 or newer. Migrations run automatically at startup, so run a single instance (or make sure only one starts at a time).
- **Offboarding:** sessions last 7 days and are not extended, so someone removed from the kthais.com Workspace loses access within a week. To revoke access immediately, delete their user row (this also deletes their sessions; their links stay, without an author):
  `psql "$DB_URL" -c "DELETE FROM \"user\" WHERE email = 'name@kthais.com';"`
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
- **`npm run typecheck` fails in `.next/dev/types` after deleting a page:** that folder is generated by `npm run dev` and can go stale; delete it with `rm -rf .next/dev`.
