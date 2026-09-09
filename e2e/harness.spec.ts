import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Presence is verified by the setup project, which this project depends on.
const emailAddress = process.env.E2E_CLERK_USER_EMAIL as string;

// @deployment-safe marks a spec as runnable against a deployed environment, which
// means two things: it writes no rows another run could see, and it depends on no
// local-only state. Untagged specs run only against CI's throwaway database.
/**
 * The drawer fetches its document on open, so waiting for the worksheet alone
 * reports a bare timeout whether the request was slow or rejected. Waiting for
 * either outcome names which one happened.
 */
async function expectRenderedWorksheet(drawer: Locator, title: string) {
  const worksheet = drawer.getByRole("article", { name: title });
  const failure = drawer.getByTestId("resource-adapter-worksheet-scaffolding-error");
  const startFresh = drawer.getByRole("button", { name: "Start from the original" });

  await expect(worksheet.or(failure).or(startFresh).first()).toBeVisible({
    timeout: 20_000,
  });
  if (await startFresh.isVisible()) {
    await startFresh.click();
  }
  await expect(worksheet.or(failure).first()).toBeVisible({ timeout: 20_000 });
  await expect(failure).toHaveCount(0);
  await expect(worksheet).toBeVisible();
}

async function expectSuggestionsReady(drawer: Locator) {
  const failure = drawer.getByRole("heading", { name: "We couldn't find scaffolds" });
  const ready = drawer.getByRole("status").filter({
    hasText: /There (are|is) .+ suggested scaffolds? for this worksheet\./,
  });
  await expect(ready.or(failure).first()).toBeVisible({ timeout: 30_000 });
  await expect(failure).toHaveCount(0);
  await expect(ready).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Add a word bank", exact: true }),
  ).toBeEnabled();
  await expect(
    drawer.getByRole("button", { name: "Add recall questions", exact: true }),
  ).toBeEnabled();
}

async function openFreshScaffolding(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/");
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await page
    .getByRole("button", { name: "Add extra scaffolding", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Add extra scaffolding" });
  await expectRenderedWorksheet(drawer, title);
  return { drawer, worksheet: drawer.getByRole("article", { name: title }) };
}

// Signed out, the sign-in prompt appears only once availability comes back true.
function waitForCapabilityAvailability(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/adapter-proxy/trpc/v1/capabilities.available") &&
      response.request().method() === "POST",
  );
}

function waitForCapabilities(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/adapter-proxy/trpc/v1/capabilities.get") &&
      response.request().method() === "POST",
  );
}

test(
  "shows the API state, a capability-based trigger, and the adapter sidebar",
  {},
  async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/");

    // Email-only sign-in creates a server-side session and skips verification.
    await clerk.signIn({ page, emailAddress });

    // Reload so the now-authenticated session drives the capabilities fetch.
    const capabilitiesResponse = waitForCapabilities(page);
    await page.goto("/");
    expect((await capabilitiesResponse).status()).toBe(200);

    await expect(page.getByRole("banner").getByRole("status")).toHaveText("API: Ready");
    const createMoreButton = page.getByRole("button", {
      name: "Add extra scaffolding",
    });
    await expect(createMoreButton).toBeVisible();
    const createMoreButtonBox = await createMoreButton.boundingBox();
    const metadataHeadingBox = await page
      .getByRole("heading", { name: "Lesson metadata" })
      .boundingBox();
    expect(createMoreButtonBox).not.toBeNull();
    expect(metadataHeadingBox).not.toBeNull();
    expect(createMoreButtonBox!.y).toBeLessThan(metadataHeadingBox!.y);

    await createMoreButton.click();

    const sidebar = page.getByRole("dialog", {
      name: "Add extra scaffolding",
    });
    await expect(sidebar).toBeVisible();
    const closeIcon = sidebar
      .getByRole("button", { name: "Close Modal" })
      .locator("img");
    await expect
      .poll(async () => closeIcon.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expectRenderedWorksheet(
      sidebar,
      "Explain how the quotient is affected when the divisor is equal to the dividend",
    );
    await expect(
      sidebar.getByRole("heading", { level: 5, name: "Question 1" }),
    ).toBeVisible();
    await expectSuggestionsReady(sidebar);
  },
);

test("generates and lists named scaffolding suggestions when the drawer opens", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { drawer, worksheet } = await openFreshScaffolding(page);
  await expectSuggestionsReady(drawer);
  await expect(
    drawer.getByRole("button", {
      name: "Break the task into ordered steps",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(0);
});

test("applying a suggestion adds an attributed contribution that survives reopening", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { drawer, worksheet } = await openFreshScaffolding(page);
  await expectSuggestionsReady(drawer);
  await expect(
    worksheet.getByText("Vocabulary you could include:", { exact: true }),
  ).toHaveCount(0);
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(0);

  await drawer.getByRole("button", { name: "Add a word bank", exact: true }).click();
  const applied = worksheet.getByText("Added support", { exact: true });
  const failure = drawer.getByRole("heading", {
    name: "We couldn't apply that scaffold",
  });
  await expect(applied.or(failure).first()).toBeVisible({ timeout: 30_000 });
  await expect(failure).toHaveCount(0);
  await expect(applied).toHaveCount(1);
  await expect(
    worksheet.getByText("Vocabulary you could include:", { exact: true }),
  ).toBeVisible();
  await expect(worksheet.getByText("compare", { exact: true })).toBeVisible();
  await expect(
    worksheet.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await worksheet.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    worksheet.getByRole("button", { name: "Remove", exact: true }),
  ).toBeEnabled();
  await expectSuggestionsReady(drawer);

  await page.reload();
  await page
    .getByRole("button", { name: "Add extra scaffolding", exact: true })
    .click();
  await drawer.getByRole("button", { name: "Carry on", exact: true }).click();
  await expect(applied).toHaveCount(1);
  await expect(
    worksheet.getByText("Vocabulary you could include:", { exact: true }),
  ).toBeVisible();
  await expect(worksheet.getByText("compare", { exact: true })).toBeVisible();
  await expect(
    worksheet.getByRole("button", { name: "Accept", exact: true }),
  ).toHaveCount(0);
  await expect(
    worksheet.getByRole("button", { name: "Remove", exact: true }),
  ).toBeEnabled();
  await expectSuggestionsReady(drawer);
});

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
      .getByRole("link", { name: /Adding rhythmic variation to ground bass/ })
      .click();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Adding rhythmic variation to ground bass",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Harmonic progressions and bass lines", { exact: true }),
    ).toBeVisible();
    await page.getByText("Browse extracted markup").click();
    await expect(
      page.getByLabel("Extracted markup for Adding rhythmic variation to ground bass"),
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
      const capabilitiesResponse = waitForCapabilities(page);
      await page.goto(`/?view=edge-cases&case=${id}`);
      expect((await capabilitiesResponse).status()).toBe(200);

      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByTestId("capability-outcome")).toHaveText(outcome);
      await expect(
        page.getByRole("button", { name: "Add extra scaffolding" }),
      ).toHaveCount(offersCreateMore ? 1 : 0);
      await expect(
        page.getByRole("region", { name: "Sign in to create more with Aila" }),
      ).toHaveCount(0);
    },
  );
}

test("shows the future multi-capability launcher shape", {}, async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress });
  await page.goto("/?view=edge-cases&case=multiple-capabilities-ui");

  const trigger = page.getByRole("button", { name: "Adapt with AI" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await menu.getByRole("menuitem", { name: "Add extra scaffolding" }).click();

  const drawer = page.getByRole("dialog", { name: "Add extra scaffolding" });
  await expect(drawer).toBeVisible();
  await expectRenderedWorksheet(drawer, "Adopting different perspectives");
  await expectSuggestionsReady(drawer);
});

test(
  "preserves an unknown directive rather than dropping it",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=edge-cases&case=unsupported-markup");

    const notes = page.getByTestId("inline-banner-message");

    await expect(notes).toContainText("unsupported-markup");
    await expect(notes).toContainText(
      "oak-future-widget was preserved without interpretation",
    );

    // The icon exercises the harness's Cloudinary asset-host defaults.
    const icon = page.getByTestId("inline-banner-icon").locator("img");
    await expect
      .poll(async () => icon.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);

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
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
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
  "offers signed-out visitors sign-in instead of the capability launcher",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    // Clerk's bot protection blocks an automated browser on a real domain, and
    // without it `isLoaded` never settles, so the panel renders nothing.
    await setupClerkTestingToken({ page });
    const availability = waitForCapabilityAvailability(page);
    await page.goto("/");
    expect((await availability).status()).toBe(200);

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
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
  },
);

test(
  "leaves signed-out visitors alone when a lesson has nothing behind it",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/?view=edge-cases&case=worksheet-without-extraction");

    // Settles only once the unauthenticated availability call has answered, so
    // the absences below are meaningful rather than merely early.
    await expect(page.getByTestId("capability-outcome")).toHaveText(
      "Capabilities state: signedOut.",
    );

    await expect(
      page.getByRole("region", { name: "Sign in to create more with Aila" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
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
    // Prompts are content-addressed, so the panel names the prompt by its
    // identifier alone; the controls carry the same kind, hence the scoping.
    const promptPreview = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Prompt preview" }) });
    await expect(
      promptPreview.getByText("scaffold-add-word-bank", { exact: true }),
    ).toBeVisible();
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

test(
  "renders every Oak fixture without unsupported content or broken images",
  {},
  async ({ page }) => {
    test.setTimeout(120_000);
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress });
    const links = await page
      .getByRole("navigation", { name: "Lesson scenarios" })
      .getByRole("link")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")!),
      );
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      await page.goto(href);
      const title = await page.getByRole("heading", { level: 1 }).innerText();
      await page
        .getByRole("button", { name: "Add extra scaffolding", exact: true })
        .click();
      const drawer = page.getByRole("dialog", { name: "Add extra scaffolding" });
      await expectRenderedWorksheet(drawer, title);
      await expectSuggestionsReady(drawer);
      const article = drawer.getByRole("article", { name: title });
      for (const toggle of await article.locator('button[aria-expanded="false"]').all())
        await toggle.click();
      await expect(
        article.getByText("Some worksheet content cannot be previewed yet."),
      ).toHaveCount(0);
      await expect(
        article.getByText("Figure unavailable in this preview."),
      ).toHaveCount(0);
      for (const img of await article.locator("img").all()) {
        await expect
          .poll(() => img.evaluate((image) => image.complete && image.naturalWidth > 0))
          .toBe(true);
      }
    }
  },
);

test(
  "serves the synthetic fixture figure offline",
  { tag: "@deployment-safe" },
  async ({ page }) => {
    await page.goto("/fixtures/balance-model.svg");
    await expect(page.locator("svg")).toBeVisible();
  },
);
