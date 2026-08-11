import { defineConfig, devices } from "@playwright/test";

/**
 * E2E_BASE_URL points the suite at something already serving — a Vercel preview,
 * or a local `pnpm dev`. Unset, Playwright starts the apps itself.
 *
 * A run against a deployment adds `--grep @deployment-safe`; the tag's definition
 * in the specs says what qualifies.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * A protected Vercel deployment serves an authentication wall instead of the
 * app. Only the harness needs this: the browser never reaches the API directly.
 */
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const localWebServers = [
  {
    command: "pnpm --filter @oaknational/resource-adapter-api dev",
    port: 3001,
    reuseExistingServer: !process.env.CI,
  },
  {
    command: "pnpm --filter @oaknational/resource-adapter-harness dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
];

export default defineConfig({
  testDir: "./e2e",
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
    },
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    ...(bypassSecret
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } }
      : {}),
  },
  // Spread, not `webServer: undefined`: exactOptionalPropertyTypes requires the
  // key to be absent rather than present and undefined.
  ...(process.env.E2E_BASE_URL ? {} : { webServer: localWebServers }),
});
