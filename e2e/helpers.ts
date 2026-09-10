import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

// Presence is verified by the setup project, which the test projects depend on.
const emailAddress = process.env.E2E_CLERK_USER_EMAIL as string;

/**
 * A teacher is offered resumable work per lesson and capability, so two tests
 * that scaffold the same lesson see each other's adaptations whatever order they
 * run in. One lesson each, and the edge-case views claim their own:
 * `multiple-capabilities-ui` renders adopting-different-perspectives.
 */
export const scaffoldingLessons = {
  applyingASuggestion:
    "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
  generatingSuggestions: "the-river-nile",
  openingTheDrawer: "forming-ions-for-ionic-bonding",
} as const;

/**
 * The drawer fetches its document on open, so waiting for the worksheet alone
 * reports a bare timeout whether the request was slow or rejected. Waiting for
 * either outcome names which one happened.
 */
export async function expectRenderedWorksheet(drawer: Locator, title: string) {
  const worksheet = drawer.getByRole("article", { name: title });
  const failure = drawer.getByTestId("resource-adapter-worksheet-scaffolding-error");

  await expect(worksheet.or(failure).first()).toBeVisible({ timeout: 20_000 });
  await expect(failure).toHaveCount(0);
  await expect(worksheet).toBeVisible();
}

export async function expectSuggestionsReady(drawer: Locator) {
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

export async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");

  // Email-only sign-in creates a server-side session and skips verification.
  await clerk.signIn({ page, emailAddress });
}

export async function openFreshScaffolding(
  page: Page,
  lessonId: string,
  trackAdaptation?: (adaptationId: string) => void,
) {
  await signIn(page);
  await page.goto(`/?lesson=${lessonId}`);
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  const opening = page.waitForResponse(
    (response) =>
      response.url().includes("/trpc/internal/worksheetScaffolding.open") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Add extra scaffolding", exact: true })
    .click();
  const response = await opening;
  expect(response.ok()).toBe(true);
  const [entry] = (await response.json()) as {
    result: { data: { outcome: string; state: { adaptationId: string } } };
  }[];
  expect(entry?.result.data.outcome).toBe("opened");
  const adaptationId = entry!.result.data.state.adaptationId;
  expect(adaptationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  trackAdaptation?.(adaptationId);
  const drawer = page.getByRole("dialog", { name: "Add extra scaffolding" });
  await expectRenderedWorksheet(drawer, title);
  return { drawer, title, worksheet: drawer.getByRole("article", { name: title }) };
}

// Signed out, the sign-in prompt appears only once availability comes back true.
export function waitForCapabilityAvailability(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/adapter-proxy/trpc/v1/capabilities.available") &&
      response.request().method() === "POST",
  );
}

export function waitForCapabilities(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/adapter-proxy/trpc/v1/capabilities.get") &&
      response.request().method() === "POST",
  );
}
