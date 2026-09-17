import { buffer } from "node:stream/consumers";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.js";

const view = "/?view=exports&mode=stored-downloads";
// The mocked tests name their own artifact, so they need no provisioned fixture.
const mocked = `${view}&artifact=22222222-2222-4222-8222-222222222222`;
const route = "**/adapter-proxy/resource-artifacts/*";

// The panel loads its status through the proxy, so its first settle waits on a
// cold API and its database rather than on anything the test is asserting.
const firstLoad = { timeout: 30_000 };

const localOnly = () =>
  test.skip(
    Boolean(
      process.env.E2E_BASE_URL || process.env.CI || process.env.E2E_BUILT_SERVERS,
    ),
    "The real-storage lifecycle test runs only against local development.",
  );

// Read-only: the shared artifact is provisioned separately and never cleaned up here.
test(
  "downloads the shared download fixture through the deployment proxy",
  { tag: "@deployment-safe" },
  async ({ page }) => {
    test.skip(
      !process.env.E2E_BASE_URL && !process.env.RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID,
      "Provision the shared download fixture to run locally.",
    );
    await signIn(page);
    await page.goto(view);
    await expect(
      page.getByText(/Configure RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID/),
    ).toHaveCount(0);
    const button = page.getByRole("button", { name: "Download stored DOCX" });
    await expect(button).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toBe(
      "Persistent-artifact-download-fixture.docx",
    );
    const stream = await download.createReadStream();
    if (!stream) throw new Error("No download stream");
    const bytes = await buffer(stream);
    expect(await download.failure()).toBeNull();
    // A truncated stream keeps the local header but loses the end-of-central-directory
    // record that closes the ZIP, which is what a wrong Content-Length would produce.
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
    expect(bytes.length).toBeGreaterThan(750_000);
  },
);

test("reports a refused download and lets the teacher retry", async ({ page }) => {
  await page.route(route, (request) =>
    request.fulfill({ status: 404, json: { error: "Not found" } }),
  );
  await page.route("**/adapter-proxy/dev/artifact-download-fixture", (request) =>
    request.fulfill({ status: 404 }),
  );
  await signIn(page);
  await page.goto(mocked);
  const button = page.getByRole("button", { name: "Download stored DOCX" });
  await expect(button).toBeEnabled();
  await button.click();
  const panel = page.getByRole("region", { name: "Stored download", exact: true });
  await expect(panel.getByRole("note")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveText(
    "This file is not available to your account.",
  );
  await expect(button).toBeEnabled();
  await page.route(route, (request) =>
    request.fulfill({
      body: Buffer.from("PK test"),
      headers: { "content-disposition": 'attachment; filename="retry.docx"' },
    }),
  );
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe("retry.docx");
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("disables duplicate download requests and announces progress", async ({
  page,
}) => {
  const { promise, resolve } = Promise.withResolvers<void>();
  await page.route(route, async (request) => {
    await promise;
    await request.fulfill({ body: Buffer.from("PK test") });
  });
  try {
    await page.route("**/adapter-proxy/dev/artifact-download-fixture", (request) =>
      request.fulfill({
        json: { artifactId: null, ready: false, stored: false, environment: "local" },
      }),
    );
    await signIn(page);
    await page.goto(mocked);
    await page.getByRole("button", { name: "Download stored DOCX" }).click();
    await expect(page.getByRole("button", { name: "Downloading…" })).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "Downloading file…" }),
    ).toBeVisible();
    resolve();
    await expect(
      page.getByRole("status").filter({ hasText: "Download started." }),
    ).toBeVisible();
  } finally {
    resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("manages your own artifact through its create, download and delete cycle", async ({
  page,
}) => {
  let stored = false;
  const id = "22222222-2222-4222-8222-222222222222";
  await page.route("**/adapter-proxy/dev/artifact-download-fixture", async (route) => {
    if (route.request().method() === "POST") stored = true;
    if (route.request().method() === "DELETE") stored = false;
    await route.fulfill({
      json: {
        stored,
        ready: stored,
        artifactId: stored ? id : null,
        environment: "staging",
      },
    });
  });
  await page.route(route, (request) =>
    request.fulfill({
      body: "test-docx",
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": "attachment; filename=personal.docx",
      },
    }),
  );
  await signIn(page);
  await page.goto(mocked);
  const panel = page.getByRole("region", { name: "Your download fixture" });
  await expect(panel.getByRole("status")).toHaveText(
    "No download fixture stored.",
    firstLoad,
  );
  await expect(panel.getByText("Environment: staging")).toBeVisible();
  const download = panel.getByRole("button", { name: "Download my DOCX" });
  const remove = panel.getByRole("button", { name: "Delete my fixture" });
  await expect(download).toBeDisabled();
  await expect(remove).toBeDisabled();
  const create = panel.getByRole("button", { name: "Create my fixture" });
  await create.click();
  await expect(panel.getByRole("status")).toHaveText("Fixture ready to download.");
  await expect(create).toBeDisabled();
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("personal.docx");
  await remove.click();
  await expect(panel.getByRole("status")).toHaveText("No download fixture stored.");
  await expect(create).toBeEnabled();
  await expect(download).toBeDisabled();
});

test("stores, downloads and deletes a real artifact of your own", async ({ page }) => {
  localOnly();
  await signIn(page);
  await page.goto(view);
  const panel = page.getByRole("region", { name: "Your download fixture" });
  const status = panel.getByRole("status");
  await expect(status).toHaveText(
    /^(No download fixture stored\.|Fixture ready to download\.|File stored;|Stored file missing;)/,
    firstLoad,
  );
  test.skip(
    !(await status.textContent())?.includes("No download fixture stored."),
    "Preserve any artifact already owned by the test account.",
  );
  try {
    await panel.getByRole("button", { name: "Create my fixture" }).click();
    await expect(status).toHaveText("Fixture ready to download.");
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await expect(status).toHaveText("Fixture ready to download.");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name: "Download my DOCX" }).click(),
    ]);
    const stream = await download.createReadStream();
    if (!stream) throw new Error("No download stream");
    const bytes = await buffer(stream);
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(await download.failure()).toBeNull();
  } finally {
    await panel.getByRole("button", { name: "Refresh status" }).click();
    const remove = panel.getByRole("button", { name: "Delete my fixture" });
    await expect(remove).toBeEnabled();
    await remove.click();
    await expect(status).toHaveText("No download fixture stored.");
  }
});
