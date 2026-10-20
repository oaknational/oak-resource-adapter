import { clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

import { vercelBypassStatePath } from "./vercel-bypass.js";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
];

setup("global setup", async ({ request }) => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s) required by the browser tests: ${missing.join(", ")}. See .env.example.`,
    );
  }

  await clerkSetup();

  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassSecret) {
    // The health route, not the page: `/` goes through Clerk's handshake.
    await request.get("/adapter-proxy/health", {
      headers: {
        "x-vercel-protection-bypass": bypassSecret,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    // Without the header, so this passes only if the cookie opens the wall. The
    // wall redirects to Vercel's login page, which would answer 200.
    const response = await request.get("/adapter-proxy/health", {
      maxRedirects: 0,
    });
    expect(
      response.status(),
      "The Vercel bypass cookie did not open the deployment.",
    ).toBe(200);
    await request.storageState({ path: vercelBypassStatePath });
  }
});
