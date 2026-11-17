import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect } from "@playwright/test";

import { createMutableAccount } from "./clerk-accounts.js";
import { test } from "./fixtures.js";
import { openScaffolding, scaffoldingEntryIn, scaffoldingLessons } from "./helpers.js";

const lesson = scaffoldingLessons.openingTheDrawer;
let account: Awaited<ReturnType<typeof createMutableAccount>> | undefined;

test.beforeAll(async () => {
  account = await createMutableAccount();
});

test.afterAll(async () => {
  await account?.remove();
});

// The account is new and has no region, so it is limited with nothing used yet.
test("asks a new teacher to accept ORA's terms, then shows their allowance, before any work starts", async ({
  page,
  trackAdaptation,
}) => {
  if (account === undefined) throw new Error("The test account was not created.");
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: account.emailAddress });

  await page.goto(`/?lesson=${lesson}`);
  await page
    .getByRole("button", { name: "Add extra scaffolding", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add extra scaffolding" });
  const terms = dialog.getByRole("heading", {
    level: 3,
    name: "Before you adapt with AI",
  });
  await expect(terms).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("link", { name: /^terms and conditions/ }),
  ).toBeFocused();

  const asking = page.waitForResponse(
    (response) =>
      response.url().includes("worksheetScaffolding.open") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Accept and continue" }).click();
  expect(await scaffoldingEntryIn(await asking)).toMatchObject({
    outcome: "needsSpendConfirmation",
  });
  const allowance = dialog.getByRole("heading", {
    level: 3,
    name: /^You can adapt up to \d+ resources? a month$/,
  });
  await expect(allowance).toBeFocused();
  await expect(terms).toBeHidden();

  const opening = page.waitForResponse(
    (response) =>
      response.url().includes("worksheetScaffolding.open") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Start adapting" }).click();
  const { state } = await scaffoldingEntryIn(await opening);
  trackAdaptation(state.adaptationId);
  await expect(allowance).toBeHidden();

  // Acceptance is stored and the lesson is counted this month, so the next
  // visit goes straight to the work it started.
  await page.reload();
  expect(await openScaffolding(page)).toMatchObject({
    outcome: "reopened",
    state: { adaptationId: state.adaptationId },
  });
  await expect(terms).toBeHidden();
  await expect(allowance).toBeHidden();

  await page.goto("/onboarding");
  await expect(page.getByText(/^Version \d+, accepted /)).toBeVisible();
});
