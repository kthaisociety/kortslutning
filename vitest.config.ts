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
