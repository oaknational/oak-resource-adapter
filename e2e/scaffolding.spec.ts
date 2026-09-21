import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import type { Locator, Page } from "@playwright/test";
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

async function downloadWorksheetXml(page: Page, button: Locator) {
  await expect(button).toBeEnabled();
  await button.focus();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    button.press("Enter"),
  ]);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  const file = await download.path();
  if (file === null) throw new Error("The DOCX download has no local file.");
  const xml = unzipSync(await readFile(file))["word/document.xml"];
  if (xml === undefined) throw new Error("The DOCX has no document XML.");
  return strFromU8(xml);
}

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
    .poll(async () =>
      closeIcon.evaluate((image) =>
        image instanceof HTMLImageElement ? image.naturalWidth : 0,
      ),
    )
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
  for (const name of [
    "Add a task vocabulary bank",
    "Add sentence starters",
    "Add sentence frames",
  ]) {
    await expect(drawer.getByRole("button", { name, exact: true })).toBeEnabled();
  }
  await expect(
    drawer.getByRole("button", {
      name: "Break the task into ordered steps",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(0);
});

test("adapts, accepts, downloads, resumes and removes a scaffold without losing work", async ({
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
  // Keep suggestion progress visible even when deterministic generation finishes quickly.
  let holdSuggestionProgress = true;
  await page.route(/worksheetScaffolding\.(accept|get)(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (holdSuggestionProgress) {
      for (const entry of Array.isArray(body) ? body : [body]) {
        const state = entry.result?.data;
        if (state?.pendingReview === null && state?.resourceDocumentId) {
          state.job = {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "suggestions.generate",
            status: "running",
            failureMessage: null,
          };
        }
      }
    }
    await route.fulfill({ response, json: body });
  });
  await worksheet.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(drawer.getByRole("status", { name: "Worksheet status" })).toContainText(
    "Considering scaffold selections",
  );

  let preparations = 0;
  page.on("request", (request) => {
    if (request.url().includes("worksheetScaffolding.prepareExport")) preparations += 1;
  });
  const downloadButton = drawer.getByRole("button", {
    name: "Download worksheet",
    exact: true,
  });
  await expect(downloadButton).toBeEnabled();
  await page.route(
    "**/adapter-proxy/resource-artifacts/*",
    (route) => route.fulfill({ status: 503 }),
    { times: 1 },
  );
  await downloadButton.click();
  const retryDownload = drawer.getByRole("button", { name: "Retry download" });
  await expect(retryDownload).toBeEnabled();
  await expect(worksheet.getByText("compare", { exact: true })).toBeVisible();
  const firstXml = await downloadWorksheetXml(page, retryDownload);
  expect(firstXml).toContain("Vocabulary you could include:");
  expect(firstXml).toContain("compare");
  expect(preparations).toBe(1);
  await expect(drawer.getByRole("status", { name: "Worksheet status" })).toContainText(
    "Considering scaffold selections",
  );
  holdSuggestionProgress = false;

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

  const resumedXml = await downloadWorksheetXml(page, downloadButton);
  expect(resumedXml).toContain("Vocabulary you could include:");
  expect(resumedXml).toContain("compare");

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
  const removedXml = await downloadWorksheetXml(page, downloadButton);
  expect(removedXml).not.toContain("Vocabulary you could include:");
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

test("keeps a retired transformation deep link consistent with the selector", async ({
  page,
}) => {
  await page.goto("/?view=transformations&selection=scaffold-chunk-tasks");
  const definition = page
    .locator("label")
    .filter({ has: page.getByText("Definition", { exact: true }) })
    .getByRole("combobox");

  await expect(definition).toHaveValue("scaffold-chunk-tasks");
  await expect(
    definition.locator('optgroup[label="Retired"] option:checked'),
  ).toHaveText("📦 Break the task into ordered steps");
  await expect(
    page.getByRole("heading", {
      name: "Break the task into ordered steps",
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preview prompt", exact: true }).click();
  await expect(page.getByRole("region", { name: "Rendered prompt" })).toContainText(
    "YOUR SCAFFOLD:",
  );
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
