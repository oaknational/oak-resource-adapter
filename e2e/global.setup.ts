import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
];

/**
 * Local runs serve the apps with `next dev`, which compiles a route when it is
 * first requested. The job pipeline and the harness page are otherwise compiled
 * inside whichever test reaches them first, against that test's timeout.
 */
async function warmLocalServers() {
  if (process.env.E2E_BASE_URL) {
    return;
  }

  await Promise.allSettled([
    fetch("http://localhost:3000/", { signal: AbortSignal.timeout(120_000) }),
    fetch("http://localhost:3001/dev/jobs/test-echo", {
      body: JSON.stringify({ message: "Warming the job pipeline" }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    }),
  ]);
}

setup("global setup", async () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s) required by the browser tests: ${missing.join(", ")}. See .env.example.`,
    );
  }

  await clerkSetup();
  await warmLocalServers();
});
