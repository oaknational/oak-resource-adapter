import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "E2E_CLERK_USER_EMAIL",
];

setup("global setup", async () => {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s) required by the browser tests: ${missing.join(", ")}. See .env.example.`,
    );
  }

  await clerkSetup();
});
