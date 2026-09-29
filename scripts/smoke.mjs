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
