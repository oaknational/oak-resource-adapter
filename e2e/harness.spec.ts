import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const emailAddress = process.env.E2E_CLERK_USER_EMAIL;

test("shows the API state, a capability-based trigger, and the adapter sidebar", async ({
  page,
}) => {
  if (!emailAddress) {
    throw new Error("E2E_CLERK_USER_EMAIL must be set for Playwright tests.");
  }

  await setupClerkTestingToken({ page });
  await page.goto("/");

  // Email-only sign-in creates a server-side session and skips verification.
  await clerk.signIn({ page, emailAddress });

  // Reload so the now-authenticated session drives the capabilities fetch.
  await page.goto("/");

  await expect(page.getByRole("status")).toHaveText("API /health: Healthy");
  await expect(
    page.getByRole("heading", { name: "Create more with Aila" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create more with AI" }).click();

  const sidebar = page.getByRole("dialog", { name: "Create more with Aila" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toContainText("Hello, World!");
  await expect(sidebar).toContainText("Adapt worksheet");
});
