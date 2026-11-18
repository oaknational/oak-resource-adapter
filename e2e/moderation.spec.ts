import { expect, type Locator } from "@playwright/test";

import { test } from "./fixtures.js";
import {
  downloadWorksheetXml,
  expectSuggestionsReady,
  openFreshScaffolding,
  scaffoldingLessons,
} from "./helpers.js";

// Not @deployment-safe: each result comes from the deterministic moderator's
// triggers in the deterministic model's canned scaffolds (docs/MODERATION.md).

async function applyScaffold(drawer: Locator, name: string) {
  await drawer.getByRole("button", { name, exact: true }).first().click();
}

function withheldNotice(drawer: Locator) {
  return drawer
    .getByRole("alert")
    .filter({ hasText: "Sorry, we couldn't show that scaffold" });
}

test("shows a guidance scaffold with the areas to check until it is accepted", async ({
  page,
  clearLessonAdaptations,
  trackAdaptation,
}) => {
  test.setTimeout(60_000);
  const { drawer, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.moderationGuidance,
    { clearLessonAdaptations, trackAdaptation },
  );
  await expectSuggestionsReady(drawer);

  await applyScaffold(drawer, "Add a word bank with definitions");

  const guidance = worksheet.getByText(
    "Content guidance: Practical equipment and activities",
  );
  await expect(guidance).toBeVisible({ timeout: 30_000 });
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(1);
  await expect(worksheet.getByText("Bunsen burner", { exact: true })).toBeVisible();

  await worksheet.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(guidance).toHaveCount(0);
  await expect(worksheet.getByText("Bunsen burner", { exact: true })).toBeVisible();
});

test("withholds a highly sensitive scaffold from the worksheet and its download", async ({
  page,
  clearLessonAdaptations,
  trackAdaptation,
}) => {
  test.setTimeout(90_000);
  const { drawer, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.moderationHighlySensitive,
    { clearLessonAdaptations, trackAdaptation },
  );
  await expectSuggestionsReady(drawer);
  // An untouched worksheet has no download, so a passing scaffold goes first.
  await applyScaffold(drawer, "Add recall questions");
  await worksheet.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    drawer.getByRole("button", { name: "Add a task glossary", exact: true }).first(),
  ).toBeEnabled({ timeout: 30_000 });

  await applyScaffold(drawer, "Add a task glossary");

  const notice = withheldNotice(drawer);
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("it covers a highly sensitive topic");
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(1);
  await expect(worksheet.getByText("oak-hs", { exact: false })).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "Add a word bank", exact: true }).first(),
  ).toBeEnabled();

  const xml = await downloadWorksheetXml(
    page,
    drawer.getByRole("button", { name: "Download worksheet", exact: true }),
  );
  expect(xml).toContain("What do you remember from the lesson");
  expect(xml).not.toContain("oak-hs");

  await notice.getByRole("button", { name: "Try again", exact: true }).click();
  // Only a notice that replaces the retry's progress takes focus, so a Try
  // again that did nothing leaves focus on the button and fails here.
  await expect(notice).toBeFocused({ timeout: 30_000 });
  await expect(notice).toHaveAccessibleDescription(
    /it covers a highly sensitive topic/,
  );
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(1);
  await expect(worksheet.getByText("oak-hs", { exact: false })).toHaveCount(0);
});

test("withholds a toxic scaffold with its own reason", async ({
  page,
  clearLessonAdaptations,
  trackAdaptation,
}) => {
  test.setTimeout(60_000);
  const { drawer, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.moderationToxic,
    { clearLessonAdaptations, trackAdaptation },
  );
  await expectSuggestionsReady(drawer);

  await applyScaffold(drawer, "Add sentence starters");

  const notice = withheldNotice(drawer);
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText("it doesn't meet Oak's community standards");
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(0);
});

test("offers to try again when applying a scaffold fails", async ({
  page,
  clearLessonAdaptations,
  trackAdaptation,
}) => {
  test.setTimeout(60_000);
  // A real moderation failure fails its job, and the Workflow SDK then logs a
  // FatalError, which fails CI's browser job (.github/workflows/ci.yml). The
  // failed state is written into the responses instead, so the apply never
  // reaches the API; execution.test.ts covers the failure itself.
  const failedApply = {
    attemptId: "55555555-5555-4555-8555-555555555555",
    failureMessage: "The background job failed while executing.",
    id: "77777777-7777-4777-8777-777777777777",
    kind: "suggestions.apply",
    status: "failed",
  };
  let latestState: Record<string, unknown> | undefined;
  let applied = false;
  await page.route(/worksheetScaffolding\.(get|open)(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const entry of Array.isArray(body) ? body : [body]) {
      const data = entry.result?.data;
      const state = data?.state ?? data;
      if (typeof state?.adaptationId === "string") {
        if (applied) state.job = failedApply;
        latestState = state;
      }
    }
    await route.fulfill({ response, json: body });
  });
  await page.route(/worksheetScaffolding\.applySuggestion(?:\?|$)/, async (route) => {
    if (latestState === undefined) throw new Error("No scaffolding state was read.");
    applied = true;
    await route.fulfill({
      json: [{ result: { data: { ...latestState, job: failedApply } } }],
    });
  });

  const { drawer, worksheet } = await openFreshScaffolding(
    page,
    scaffoldingLessons.moderationFailing,
    { clearLessonAdaptations, trackAdaptation },
  );
  await expectSuggestionsReady(drawer);

  await applyScaffold(drawer, "Add sentence frames");

  const failure = drawer.getByRole("alert");
  await expect(
    failure.getByRole("heading", { name: "We couldn't apply that scaffold" }),
  ).toBeVisible();
  await expect(
    failure.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await expect(worksheet.getByText("Added support", { exact: true })).toHaveCount(0);
});
