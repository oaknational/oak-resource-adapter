import { clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

import { vercelBypassStatePath } from "./vercel-bypass.js";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
];

const clerkApi = "https://api.clerk.com/v1";

// ORA offers nothing until OWA onboarding sets this flag. The harness's stand-in
// onboarding page can clear it, so every run restores it.
async function ensureOnboarded(emailAddress: string, secretKey: string) {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(
    `${clerkApi}/users?email_address=${encodeURIComponent(emailAddress)}`,
    { headers },
  );
  expect(response.ok, "The browser-test account could not be looked up.").toBe(true);
  const [user] = (await response.json()) as {
    id: string;
    public_metadata: { owa?: { isOnboarded?: boolean } };
  }[];
  expect(user, "The browser-test account does not exist.").toBeDefined();
  if (user === undefined || user.public_metadata.owa?.isOnboarded === true) {
    return;
  }
  const update = await fetch(`${clerkApi}/users/${user.id}/metadata`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ public_metadata: { owa: { isOnboarded: true } } }),
  });
  expect(update.ok, "The browser-test account could not be onboarded.").toBe(true);
}

setup("global setup", async ({ request }) => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s) required by the browser tests: ${missing.join(", ")}. See .env.example.`,
    );
  }

  await clerkSetup();
  await ensureOnboarded(
    process.env.E2E_CLERK_USER_EMAIL ?? "",
    process.env.CLERK_SECRET_KEY ?? "",
  );

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
