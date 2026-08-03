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

// Untagged on purpose: it fires a real error report, so it must not run against
// a deployed environment's Sentry.
test("contains a simulated adapter crash and reports it to the API", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");

  // Wait for the session, or the report would get a 401 instead of a receipt.
  // The sign-in button disappearing is the signal that Clerk has restored it.
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in" }),
  ).toHaveCount(0);

  const section = page.getByRole("region", { name: "Error boundary test" });
  await expect(section).toContainText("The adapter surface renders normally.");

  // Listen before clicking so the report cannot slip past.
  const reportResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/trpc/v1/clientErrors.report") &&
      response.request().method() === "POST",
  );

  await section.getByRole("button", { name: "Simulate adapter crash" }).click();

  // The fallback replaces the crashed content...
  const fallback = section.getByTestId("resource-adapter-error-fallback");
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText("Create more with Aila is unavailable");
  // ...and the page around it is untouched.
  await expect(
    page.getByRole("heading", { level: 1, name: "Adding fractions" }),
  ).toBeVisible();

  // The caught error reaches the API.
  const response = await reportResponse;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject([
    { result: { data: { received: true } } },
  ]);

  // Try again re-catches while the crash is still simulated.
  await fallback.getByRole("button", { name: "Try again" }).click();
  await expect(section.getByTestId("resource-adapter-error-fallback")).toBeVisible();

  await section.getByRole("button", { name: "Clear simulated crash" }).click();
  await expect(section).toContainText("The adapter surface renders normally.");
  await expect(section.getByTestId("resource-adapter-error-fallback")).toHaveCount(0);
});

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
