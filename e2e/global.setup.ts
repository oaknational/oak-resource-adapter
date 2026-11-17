import { clerkSetup } from "@clerk/testing/playwright";
// Types only: deployment runs install the workspace without building its packages.
import type { RuleCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";
import { expect, type APIRequestContext, test as setup } from "@playwright/test";

import { prepareAccount } from "./clerk-accounts.js";
import { vercelBypassStatePath } from "./vercel-bypass.js";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
];

async function currentTermsVersion(request: APIRequestContext): Promise<number> {
  const response = await request.get("/adapter-proxy/dev/rules");
  expect(response.ok(), "ORA's rules could not be read for the terms version.").toBe(
    true,
  );
  const { gates } = (await response.json()) as RuleCatalogue;
  const version = gates.find(({ id }) => id === "terms")?.config["termsVersion"];
  if (typeof version !== "number") {
    throw new TypeError("ORA's rules do not name a terms version.");
  }
  return version;
}

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

  await prepareAccount(process.env.E2E_CLERK_USER_EMAIL ?? "", {
    termsVersion: await currentTermsVersion(request),
  });
});
