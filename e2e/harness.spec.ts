import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// Presence is verified by the setup project, which this project depends on.
const emailAddress = process.env.E2E_CLERK_USER_EMAIL as string;

// @deployment-safe marks a spec as runnable against a deployed environment, which
// means two things: it writes no rows another run could see, and it depends on no
// local-only state. Untagged specs run only against CI's throwaway database.
test(
  "shows the API state, a capability-based trigger, and the adapter sidebar",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
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
  },
);

test(
  "offers signed-out visitors sign-in rather than the Aila trigger",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/");

    const signInPrompt = page.getByRole("region", {
      name: "Sign in to create more with Aila",
    });

    await expect(signInPrompt).toBeVisible();
    await expect(signInPrompt.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Sign in" }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { exact: true, name: "Create more with Aila" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create more with AI" })).toHaveCount(
      0,
    );
  },
);
