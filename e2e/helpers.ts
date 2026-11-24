import { readFile } from "node:fs/promises";

import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

// Presence is verified by the setup project, which the test projects depend on.
const emailAddress = process.env.E2E_CLERK_USER_EMAIL as string;

/**
 * A teacher is offered resumable work per lesson and capability, so two tests
 * that scaffold the same lesson see each other's adaptations whatever order they
 * run in. One lesson each, and the edge-case views claim their own:
 * `capabilities-ui` renders adopting-different-perspectives.
 */
export const scaffoldingLessons = {
  applyingASuggestion:
    "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
  generatingSuggestions: "the-river-nile",
  moderationFailing: "what-greek-myths-can-tell-us-about-ancient-greece",
  moderationGuidance: "using-trace-tables",
  moderationHighlySensitive: "what-we-know-about-ancient-greece",
  moderationToxic: "air-resistance-do-and-review",
  openingTheDrawer: "forming-ions-for-ionic-bonding",
} as const;

const worksheetMenuItems = {
  scaffolded: "Scaffolded_worksheet.docx",
  original: "Original_worksheet.docx",
} as const;

export async function downloadWorksheetXml(
  page: Page,
  drawer: Locator,
  variant: keyof typeof worksheetMenuItems = "scaffolded",
) {
  await drawer.getByRole("button", { name: "Download worksheet", exact: true }).click();
  const menuItem = drawer.getByRole("menuitem", {
    name: worksheetMenuItems[variant],
    exact: true,
  });
  await expect(menuItem).toBeEnabled();
  await menuItem.focus();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    menuItem.press("Enter"),
  ]);
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(
    variant === "original" ? /-original\.docx$/ : /\.docx$/,
  );
  const file = await download.path();
  if (file === null) throw new Error("The DOCX download has no local file.");
  const xml = unzipSync(await readFile(file))["word/document.xml"];
  if (xml === undefined) throw new Error("The DOCX has no document XML.");
  return strFromU8(xml);
}

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
    hasText: /There (are|is) .+ suggested scaffolds?\. Review and accept/,
  });
  await expect(ready.or(failure).first()).toBeVisible({ timeout: 30_000 });
  await expect(failure).toHaveCount(0);
  await expect(ready).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Add a word bank", exact: true }),
  ).toBeEnabled();
  await expect(
    drawer.getByRole("button", { name: "Add recall questions", exact: true }).first(),
  ).toBeEnabled();
}

export async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");

  // Email-only sign-in creates a server-side session and skips verification.
  await clerk.signIn({ page, emailAddress });
}

type ScaffoldingState = {
  adaptationId: string;
  job: { id: string; kind: string; status: string } | null;
  suggestions: { id: string }[];
};

type ScaffoldingEntry = { outcome: string; state: ScaffoldingState };

/**
 * tRPC batches concurrent calls into one request, so a procedure's result sits
 * at that procedure's position in the URL path.
 */
async function procedureData<T>(
  response: Response,
  procedure: string,
): Promise<T | undefined> {
  const path = decodeURIComponent(new URL(response.url()).pathname);
  const index = (path.split("/").at(-1) ?? "").split(",").indexOf(procedure);
  if (index === -1 || !response.ok()) return undefined;
  const results = (await response.json()) as { result: { data: T } }[];
  return results[index]?.result.data;
}

async function scaffoldingStateIn(response: Response) {
  const entry = await procedureData<ScaffoldingEntry>(
    response,
    "worksheetScaffolding.open",
  );
  return (
    entry?.state ??
    (await procedureData<ScaffoldingState>(response, "worksheetScaffolding.get"))
  );
}

function hasGeneratedSuggestions(
  state: ScaffoldingState | undefined,
): state is ScaffoldingState {
  return (
    state?.job?.kind === "suggestions.generate" && state.job.status === "succeeded"
  );
}

/**
 * Start before opening the drawer. Resolves with the first state, from `open`
 * or a poll, that shows a finished suggestion run.
 */
export async function waitForGeneratedSuggestions(page: Page) {
  const response = await page.waitForResponse(async (candidate) =>
    hasGeneratedSuggestions(await scaffoldingStateIn(candidate)),
  );
  const state = await scaffoldingStateIn(response);
  if (!hasGeneratedSuggestions(state)) {
    throw new Error("The finished suggestion run could not be read back.");
  }
  return state;
}

export function suggestionIds(state: ScaffoldingState): string[] {
  return state.suggestions.map(({ id }) => id).toSorted((a, b) => a.localeCompare(b));
}

export async function scaffoldingEntryIn(
  response: Response,
): Promise<ScaffoldingEntry> {
  expect(response.ok()).toBe(true);
  const entry = await procedureData<ScaffoldingEntry>(
    response,
    "worksheetScaffolding.open",
  );
  if (entry === undefined) throw new Error("The open response had no entry.");
  return entry;
}

/** Opens the lesson page's "Adapt with AI" menu, which must be closed. */
export async function openAiMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Adapt with AI", exact: true }).click();
  return page.getByRole("menu", { name: "Adapt with AI" });
}

export async function chooseFromAiMenu(page: Page, item: string) {
  const menu = await openAiMenu(page);
  await menu.getByRole("menuitem", { name: item, exact: true }).click();
}

export async function openScaffolding(page: Page): Promise<ScaffoldingEntry> {
  const opening = page.waitForResponse(
    (response) =>
      response.url().includes("worksheetScaffolding.open") &&
      response.request().method() === "POST",
  );
  await chooseFromAiMenu(page, "Scaffold practice tasks");
  return scaffoldingEntryIn(await opening);
}

export async function openFreshScaffolding(
  page: Page,
  lessonId: string,
  {
    clearLessonAdaptations,
    trackAdaptation,
  }: {
    clearLessonAdaptations: (lessonSlug: string) => Promise<void>;
    trackAdaptation: (adaptationId: string) => void;
  },
) {
  await signIn(page);
  await clearLessonAdaptations(lessonId);
  await page.goto(`/?lesson=${lessonId}`);
  const title = await lessonHeading(page).innerText();
  const entry = await openScaffolding(page);
  expect(entry.outcome).toBe("opened");
  const { adaptationId } = entry.state;
  expect(adaptationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  trackAdaptation(adaptationId);
  const drawer = page.getByRole("dialog", { name: "Aila | Oak's AI" });
  await expectRenderedWorksheet(drawer, title);
  return {
    adaptationId,
    jobId: entry.state.job?.id,
    drawer,
    title,
    worksheet: drawer.getByRole("article", { name: title }),
  };
}

export function lessonHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 2 }).first();
}

// Signed out, the menu's sign-in item appears only once availability comes back true.
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
