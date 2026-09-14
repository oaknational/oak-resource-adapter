import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";

const exportsUrl = "/?view=exports&fixture=linear-equations-smoke";
const docxRoute = "**/adapter-proxy/dev/exports/docx";

/**
 * A click on the server-rendered markup is silently lost until React attaches
 * its handlers, and the export controls offer no signal of their own. The
 * header's health check is the first thing on any view that resolves only after
 * hydration, so waiting for it to leave "Checking" makes the controls usable.
 */
async function openExports(page: Page, url = exportsUrl) {
  await page.goto(url);
  await expect(
    page.getByRole("banner").getByRole("button", { name: /^API:/ }),
  ).not.toHaveText(/Checking/);
}

test("downloads a DOCX from the local API without embedding figures", async ({
  page,
}) => {
  await openExports(page);
  await page.getByRole("checkbox", { name: "Embed figures" }).uncheck();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download DOCX", exact: true }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("Exploring-linear-equations.docx");
  const stream = await download.createReadStream();
  if (stream === null) throw new Error("DOCX download has no readable stream.");
  const bytes = await buffer(stream);
  expect(await download.failure()).toBeNull();
  expect(bytes.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(bytes.length).toBeGreaterThan(1_000);
  await expect(
    page.getByRole("status").filter({ hasText: "Download started." }),
  ).toBeVisible();
});

test("exports the selected fixture and disables controls until generation finishes", async ({
  page,
}) => {
  const { promise: responseReady, resolve: releaseResponse } =
    Promise.withResolvers<void>();

  await page.route(docxRoute, async (route) => {
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      headers: {
        "content-disposition": 'attachment; filename="selected-fixture.docx"',
      },
      body: Buffer.from("PK mocked DOCX"),
    });
  });

  try {
    await openExports(page);
    const fixtures = page.getByRole("navigation", { name: "Export fixtures" });
    await fixtures
      .getByRole("link", { name: "Forming ions for ionic bonding" })
      .click();
    await expect(page).toHaveURL(/fixture=forming-ions-for-ionic-bonding(?:&|$)/);
    await expect(
      fixtures.getByRole("link", { name: "Forming ions for ionic bonding" }),
    ).toHaveAttribute("aria-current", "page");

    const embedFigures = page.getByRole("checkbox", { name: "Embed figures" });
    await embedFigures.uncheck();
    const [request] = await Promise.all([
      page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/adapter-proxy/dev/exports/docx" &&
          request.method() === "POST",
      ),
      page.getByRole("button", { name: "Download DOCX", exact: true }).click(),
    ]);
    expect(request.postDataJSON()).toMatchObject({
      document: {
        id: "oak:worksheet:forming-ions-for-ionic-bonding:pupil",
        metadata: { title: "Forming ions for ionic bonding" },
      },
      embedFigures: false,
    });
    await expect(
      page.getByRole("button", { name: "Generating DOCX…", exact: true }),
    ).toBeDisabled();
    await expect(embedFigures).toBeDisabled();

    releaseResponse();
    await expect(
      page.getByRole("status").filter({ hasText: "Download started." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download DOCX", exact: true }),
    ).toBeEnabled();
    await expect(embedFigures).toBeEnabled();
  } finally {
    releaseResponse();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const { status, message } of [
  {
    status: 404,
    message:
      "DOCX export is unavailable. Dev routes may be disabled or the export endpoint is not deployed.",
  },
  { status: 500, message: "DOCX conversion failed." },
]) {
  test(`shows a ${status} export error and resets the download button`, async ({
    page,
  }) => {
    await page.route(docxRoute, (route) =>
      route.fulfill({ status, json: { error: message } }),
    );
    await openExports(page);
    const download = page.getByRole("button", {
      name: "Download DOCX",
      exact: true,
    });
    await download.click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(message);
    await expect(download).toBeEnabled();
    await expect(page.getByRole("checkbox", { name: "Embed figures" })).toBeEnabled();
  });
}
