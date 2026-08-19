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

const edgeCases = [
  {
    id: "worksheet-without-extraction",
    heading: "Oak has a worksheet, we have no data for it",
    outcome: "The capabilities endpoint returned 0 capabilities.",
    offersCreateMore: false,
  },
  {
    id: "extraction-without-worksheet",
    heading: "We have worksheet data, Oak has no worksheet",
    outcome: "The capabilities endpoint returned 0 capabilities.",
    offersCreateMore: false,
  },
  {
    id: "unsupported-markup",
    heading: "Worksheet data uses a feature we do not recognise",
    outcome: "The capabilities endpoint returned 1 capabilities.",
    offersCreateMore: true,
  },
  {
    id: "malformed-extraction",
    heading: "Worksheet data we cannot read at all",
    outcome: "The capabilities endpoint returned 1 capabilities.",
    offersCreateMore: true,
  },
] as const;

for (const { heading, id, offersCreateMore, outcome } of edgeCases) {
  test(
    `reports what OWA sees for: ${heading.toLowerCase()}`,
    {
      tag: "@deployment-safe",
    },
    async ({ page }) => {
      await setupClerkTestingToken({ page });
      await page.goto("/");
      await clerk.signIn({ page, emailAddress });

      // The same endpoint the eligible lessons use has to be consulted, so an
      // absent button proves an empty response rather than a skipped request.
      const capabilitiesResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/adapter-proxy/") &&
          response.url().includes("capabilities"),
      );
      await page.goto(`/?view=edge-cases&case=${id}`);
      expect((await capabilitiesResponse).status()).toBe(200);

      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByTestId("capability-outcome")).toHaveText(outcome);
      await expect(
        page.getByRole("button", { name: "Create more with AI" }),
      ).toHaveCount(offersCreateMore ? 1 : 0);
      await expect(
        page.getByRole("region", { name: "Sign in to create more with Aila" }),
      ).toHaveCount(0);
    },
  );
}

test(
  "preserves an unknown directive rather than dropping it",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=edge-cases&case=unsupported-markup");

    // The lesson tab shows this too, but from provisional fixture markup that is
    // regenerated from real extractions; this case owns its own sample so the
    // assertion survives that. The testid is oak-components' own, which keeps the
    // assertion off our banner copy.
    const notes = page.getByTestId("inline-banner-message");

    // Both strings are produced by resource-document rather than written in the
    // banner, so rewording the banner cannot quietly void the assertion.
    await expect(notes).toContainText("unsupported-markup");
    await expect(notes).toContainText(
      "oak-future-widget was preserved without interpretation",
    );

    // The banner's icon comes from Cloudinary, so this also covers the asset host
    // defaults the harness supplies in place of OWA's runtime config.
    const icon = page.getByTestId("inline-banner-icon").locator("img");
    await expect
      .poll(async () => icon.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);

    // The rest of the document still parses around the directive it cannot model.
    await expect(
      page.getByRole("heading", { name: "Details" }).locator(".."),
    ).toContainText("Questions we could still read");
  },
);

test(
  "classifies extraction markup it cannot parse",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=edge-cases&case=malformed-extraction");

    const facts = page.getByRole("heading", { name: "Details" }).locator("..");

    await expect(facts).toContainText("malformed-document");
    await expect(facts).toContainText("frontmatter");
  },
);

test(
  "falls back to the retry panel when the capabilities endpoint is unreachable",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress });
    await page.goto("/?view=edge-cases&case=capabilities-unavailable");

    const fallback = page.getByRole("region", {
      name: "Create more with Aila is unavailable",
    });

    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create more with AI" })).toHaveCount(
      0,
    );
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

test(
  "previews a transformation prompt against a fixture",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=transformations");

    await expect(
      page.getByRole("heading", { level: 1, name: "Test transformations" }),
    ).toBeVisible();

    // The catalogue arrives from the API, so the definition select is the seam
    // between the registry and the harness.
    const definition = page.getByLabel("Definition");
    await expect(definition).toBeEnabled();
    await definition.selectOption("scaffold-add-word-bank");

    await expect(page.getByLabel("Support level")).toBeVisible();
    await expect(page.getByLabel("Target node")).toBeVisible();

    // Previewing renders the prompt without invoking a model.
    await page.getByRole("button", { name: "Preview prompt" }).click();

    await expect(page.getByRole("heading", { name: "Prompt preview" })).toBeVisible();
    // Names the prompt it rendered, which the controls above do not.
    await expect(page.getByText(/scaffold-add-word-bank, version \d+/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Rendered prompt" })).toContainText(
      "YOUR SCAFFOLD: a word bank",
    );

    // The material catalogue explains what a prompt can be given, and why not.
    const material = page.getByRole("region", { name: "Oak lesson material" });
    await expect(
      material.getByRole("rowheader", { name: "Lesson keywords" }),
    ).toBeVisible();
    await expect(material.getByRole("row", { name: /Lesson slides/ })).toContainText(
      "Not yet",
    );
  },
);
