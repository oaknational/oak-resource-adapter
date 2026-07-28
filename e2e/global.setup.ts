import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Setup must be run serially if tests are parallelized.
setup.describe.configure({ mode: "serial" });

setup("global setup", async () => {
  await clerkSetup();
});
