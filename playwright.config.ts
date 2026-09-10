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

/**
 * `test:e2e` builds before Playwright starts, so `next dev` would compile every
 * route a second time. CI serves the build instead; E2E_BUILT_SERVERS does the
 * same locally, where `next dev` otherwise keeps its edit-and-reload loop.
 */
// Matched against an affirmative rather than coerced, so E2E_BUILT_SERVERS=0
// leaves `next dev` in place instead of reading as "on".
const builtServers =
  Boolean(process.env.CI) ||
  ["1", "true", "yes", "on"].includes(
    process.env.E2E_BUILT_SERVERS?.trim().toLowerCase() ?? "",
  );
const serverScript = builtServers ? "start" : "dev";

const localWebServers = [
  {
    command: `pnpm --filter @oaknational/resource-adapter-api ${serverScript}`,
    url: "http://localhost:3001/health",
    // A served build runs with NODE_ENV=production, which selects PostHog for
    // feature flags and needs a project key the suite has no business holding.
    ...(builtServers ? { env: { FEATURE_FLAG_TRANSPORT: "in-memory" } } : {}),
    reuseExistingServer: !builtServers,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  },
  {
    command: `pnpm --filter @oaknational/resource-adapter-harness ${serverScript}`,
    port: 3000,
    reuseExistingServer: !builtServers,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  },
];

export default defineConfig({
  testDir: "./e2e",
  // Job-producing tests hold a lesson each (see e2e/helpers.ts), so tests in one
  // spec can run together.
  fullyParallel: true,
  // Pinned rather than left to Playwright, which derives it from the CPU count
  // of whichever runner picked the job.
  ...(process.env.CI ? { workers: 4 } : {}),
  // The github reporter annotates the failing lines on the pull request itself,
  // so a failure is readable without downloading anything.
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["list"]],
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
    // Not `on-first-retry`: retries are off, so that setting never captures
    // anything. A failure has to carry its own evidence.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(bypassSecret
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } }
      : {}),
  },
  // Spread, not `webServer: undefined`: exactOptionalPropertyTypes requires the
  // key to be absent rather than present and undefined.
  ...(process.env.E2E_BASE_URL ? {} : { webServer: localWebServers }),
});
