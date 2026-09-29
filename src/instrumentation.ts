export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("./lib/env");
  getEnv(); // Fail fast, naming any missing or invalid variable.

  const { getDb } = await import("./lib/db");
  const { runMigrations } = await import("./lib/db/migrate");
  await runMigrations(getDb());
}
