import { expect, test } from "@playwright/test";

// @deployment-safe marks a spec as runnable against a deployed environment, which
// means two things: it writes no rows another run could see, and it depends on no
// local-only state. Untagged specs run only against CI's throwaway database.

/**
 * Every Oak lesson fixture reaches the navigation. Asserted exactly so a link
 * that stops rendering cannot quietly shrink the sweep below; a new fixture is
 * expected to update it.
 */
const oakLessonFixtureCount = 10;

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

test(
  "reads Oak material only when asked for it",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    // Summarising the transcript costs a model call, so the count matters as
    // much as the panel: a fetch on render would invoke a model per page view.
    let requests = 0;
    await page.route("**/adapter-proxy/dev/oak-material", (route) => {
      requests += 1;
      return route.fulfill({
        body: JSON.stringify({ error: "Oak is unreachable." }),
        contentType: "application/json",
        status: 502,
      });
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "What Oak publishes for this lesson" }),
    ).toBeVisible();
    const load = page.getByRole("button", { name: "Load Oak material" });
    await expect(load).toBeEnabled();
    expect(requests).toBe(0);

    await load.click();

    await expect(page.getByText("Oak is unreachable.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
    expect(requests).toBe(1);
  },
);

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
  "renders every Oak fixture without unsupported content or broken images",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    // The lesson page renders the original worksheet itself, so this needs no
    // session and no drawer. Anything reaching the scaffolding router would mean
    // it had started adapting, which is what makes the sweep safe to deploy.
    const scaffoldingRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("worksheetScaffolding")) {
        scaffoldingRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto("/");
    const links = await page
      .getByRole("navigation", { name: "Lesson scenarios" })
      .getByRole("link")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")!),
      );
    expect(links).toHaveLength(oakLessonFixtureCount);

    for (const href of links) {
      await page.goto(href);
      const title = await page.getByRole("heading", { level: 1 }).innerText();
      const worksheet = page.getByRole("article", {
        name: `Original worksheet: ${title}`,
      });
      await expect(worksheet).toBeVisible();

      for (const toggle of await worksheet
        .locator('button[aria-expanded="false"]')
        .all())
        await toggle.click();
      await expect(
        worksheet.getByText("Some worksheet content cannot be previewed yet."),
      ).toHaveCount(0);
      await expect(
        worksheet.getByText("Figure unavailable in this preview."),
      ).toHaveCount(0);
      for (const img of await worksheet.locator("img").all()) {
        await expect
          .poll(() => img.evaluate((image) => image.complete && image.naturalWidth > 0))
          .toBe(true);
      }
    }

    expect(scaffoldingRequests).toEqual([]);
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
