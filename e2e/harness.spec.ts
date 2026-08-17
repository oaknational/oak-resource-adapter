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

    const createMoreButton = page.getByRole("button", {
      name: "Create more with AI",
    });
    const createMoreButtonBox = await createMoreButton.boundingBox();
    const metadataHeadingBox = await page
      .getByRole("heading", { name: "Lesson metadata" })
      .boundingBox();
    expect(createMoreButtonBox).not.toBeNull();
    expect(metadataHeadingBox).not.toBeNull();
    expect(createMoreButtonBox!.y).toBeLessThan(metadataHeadingBox!.y);

    await createMoreButton.click();

    const sidebar = page.getByRole("dialog", { name: "Create more with Aila" });
    await expect(sidebar).toBeVisible();
    const closeIcon = sidebar.getByRole("button", { name: "Close" }).locator("img");
    await expect
      .poll(async () => closeIcon.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(sidebar).toContainText("Hello, World!");
    await expect(sidebar).toContainText("Scaffolded Practice Sheet");
    await expect(sidebar).toContainText("Worksheet data loaded");
    await expect(sidebar).toContainText("6 questions");
  },
);

test(
  "switches between representative lesson scenarios",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Explain how the quotient is affected when the divisor is equal to the dividend",
      }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Lesson scenarios" })
      .getByRole("link", { name: /Composing in a samba style/ })
      .click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Composing in a samba style" }),
    ).toBeVisible();
    await expect(page.getByText("Samba music", { exact: true })).toBeVisible();
    await page.getByText("Browse extracted markup").click();
    await expect(
      page.getByLabel("Extracted markup for Composing in a samba style"),
    ).toContainText("oak-rhythm-grid");
  },
);

test(
  "reveals skip navigation above the site header",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    const headerBoxBeforeFocus = await page.getByRole("banner").boundingBox();
    await page.keyboard.press("Tab");

    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    const headerBoxAfterFocus = await page.getByRole("banner").boundingBox();

    expect(headerBoxBeforeFocus).not.toBeNull();
    expect(headerBoxAfterFocus).not.toBeNull();
    expect(headerBoxAfterFocus!.y).toBe(headerBoxBeforeFocus!.y);
  },
);

// The crash section is not gated on authentication and the caught error goes no
// further than the harness logger, so this needs no session and writes nothing.
test(
  "contains a simulated adapter crash",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=smoke-tests");

    const section = page.getByRole("region", { name: "Error boundary test" });
    await expect(section).toContainText("The adapter surface renders normally.");

    await section.getByRole("button", { name: "Simulate adapter crash" }).click();

    // The fallback replaces the crashed content...
    const fallback = section.getByTestId("resource-adapter-error-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("Create more with Aila is unavailable");
    // ...and the page around it is untouched.
    await expect(
      page.getByRole("heading", { level: 1, name: "Smoke tests" }),
    ).toBeVisible();

    // Try again re-catches while the crash is still simulated.
    await fallback.getByRole("button", { name: "Try again" }).click();
    await expect(section.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    await section.getByRole("button", { name: "Clear simulated crash" }).click();
    await expect(section).toContainText("The adapter surface renders normally.");
    await expect(section.getByTestId("resource-adapter-error-fallback")).toHaveCount(0);
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
