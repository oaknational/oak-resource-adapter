import { expect } from "@playwright/test";

import { test } from "./fixtures.js";

import {
  expectRenderedWorksheet,
  expectSuggestionsReady,
  openFreshScaffolding,
  scaffoldingLessons,
  signIn,
  waitForCapabilities,
} from "./helpers.js";

// @deployment-safe marks a spec as runnable against a deployed environment, which
// means two things: it writes no rows another run could see, and it depends on no
// local-only state. Untagged specs run only against CI's throwaway database.

test("shows the API state, a capability-based trigger, and the adapter sidebar", async ({
  page,
}) => {
  await signIn(page);

  // Reload so the now-authenticated session drives the capabilities fetch.
  const capabilitiesResponse = waitForCapabilities(page);
  await page.goto(`/?lesson=${scaffoldingLessons.openingTheDrawer}`);
  expect((await capabilitiesResponse).status()).toBe(200);
  const title = await page.getByRole("heading", { level: 1 }).innerText();

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
  const closeIcon = sidebar.getByRole("button", { name: "Close Modal" }).locator("img");
  await expect
    .poll(async () => closeIcon.evaluate((image) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expectRenderedWorksheet(sidebar, title);
  await expect(
    sidebar.getByRole("heading", { level: 5, name: "Question 1" }),
  ).toBeVisible();
});

test("generates and lists named scaffolding suggestions when the drawer opens", async ({
  page,
}) => {
  const { drawer, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.generatingSuggestions,
  );
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
  trackAdaptation,
}) => {
  test.setTimeout(90_000);
  const { drawer, title, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.applyingASuggestion,
    trackAdaptation,
  );
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

  await worksheet.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(applied).toHaveCount(0);
  await expectRenderedWorksheet(drawer, title);
  await expectSuggestionsReady(drawer);
  await expect(
    drawer.getByRole("heading", { name: "We couldn't remove that scaffold" }),
  ).toHaveCount(0);
  await expect(
    worksheet.getByText("Vocabulary you could include:", { exact: true }),
  ).toHaveCount(0);
});

test("shows the future multi-capability launcher shape", async ({ page }) => {
  await signIn(page);
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
});

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

    // Each control's label wraps its select, so its accessible name carries the
    // option text and the support-level description with it — one of which reads
    // "without definitions". Matching the label's own text keeps these distinct.
    const control = (name: string) =>
      page
        .locator("label")
        .filter({ has: page.getByText(name, { exact: true }) })
        .getByRole("combobox");

    // The catalogue arrives from the API, so the definition select is the seam
    // between the registry and the harness.
    const definition = control("Definition");
    await expect(definition).toBeEnabled();
    await definition.selectOption("scaffold-add-word-bank");

    await expect(control("Support level")).toBeVisible();
    await expect(control("Target node")).toBeVisible();

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
