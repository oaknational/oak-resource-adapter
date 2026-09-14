import { expect, test, type Page } from "@playwright/test";

const roundTripPath = "**/adapter-proxy/dev/storage/roundtrip";
const success = {
  bucket: "storage-test-bucket",
  byteSize: 35,
  crc32c: "AAAAAA==",
  environment: "preview",
  federated: true,
  key: "preview/_round-trip/test/probe.txt",
  status: "ok",
};

function panel(page: Page) {
  return page.getByRole("region", { name: "Artifact storage test" });
}

// @deployment-safe: a bounded payload, a unique key, and cleanup in the API.
test(
  "writes, reads back and deletes an artifact as the deployment itself",
  { tag: "@deployment-safe" },
  async ({ request }) => {
    test.setTimeout(60_000);
    test.skip(
      !process.env.E2E_BASE_URL,
      "There is no federated identity to exercise off a deployment.",
    );

    const response = await request.post("/adapter-proxy/dev/storage/roundtrip", {
      timeout: 45_000,
    });
    const body = await response.text();

    expect(response.status(), body).toBe(200);
    expect(JSON.parse(body)).toMatchObject({
      federated: true,
      environment: expect.stringMatching(/^(?:preview|staging)$/),
      key: expect.stringMatching(/^(?:preview|staging)\/_round-trip\//),
      byteSize: expect.any(Number),
      crc32c: expect.any(String),
      status: "ok",
    });
  },
);

test.describe("mocked artifact storage", { tag: "@deployment-safe" }, () => {
  test.beforeEach(async ({ page }) => {
    // No test in this group may fall through to the real bucket.
    await page.route(roundTripPath, (route) => route.abort());
    await page.route("**/adapter-proxy/health", (route) =>
      route.fulfill({ json: { status: "ok" } }),
    );
    await page.route("**/adapter-proxy/health/ready", (route) =>
      route.fulfill({
        json: {
          status: "ready",
          checks: {
            artifactStorage: {
              label: "Artifact storage",
              status: "ready",
              message: "Artifact storage configured.",
            },
          },
        },
      }),
    );
  });

  for (const { federated, credentials } of [
    { federated: true, credentials: "An impersonated service account" },
    { federated: false, credentials: "Application default credentials" },
  ]) {
    test(`shows a successful round trip using ${credentials}`, async ({ page }) => {
      let requestMethod: string | undefined;
      await page.route(roundTripPath, (route) => {
        requestMethod = route.request().method();
        return route.fulfill({ json: { ...success, federated } });
      });
      await page.goto("/?view=smoke-tests");
      const section = panel(page);

      await expect(section).toContainText("Status: Not run");
      await section.getByRole("button", { name: "Run storage round trip" }).click();

      await expect(section).toContainText("Status: Succeeded");
      expect(requestMethod).toBe("POST");
      await expect(section).toContainText(credentials);
      await expect(section).toContainText(
        "Wrote, read back and deleted a 35-byte object.",
      );
      await expect(section).toContainText(success.bucket);
      await expect(section).toContainText(success.key);
    });
  }

  test("disables repeat requests while the round trip is running", async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(roundTripPath, async (route) => {
      await pending;
      await route.fulfill({ json: success });
    });

    try {
      await page.goto("/?view=smoke-tests");
      const section = panel(page);
      const button = section.getByRole("button", { name: "Run storage round trip" });
      await button.click();

      await expect(section).toContainText("Status: Running");
      await expect(button).toBeDisabled();
      release();
      await expect(section).toContainText("Status: Succeeded");
      await expect(button).toBeEnabled();
    } finally {
      release();
    }
  });

  test("reports cleanup failures and clears them after a successful retry", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route(roundTripPath, (route) => {
      attempts += 1;
      return attempts === 1
        ? route.fulfill({
            status: 502,
            json: {
              status: "failed",
              bucket: success.bucket,
              key: success.key,
              federated: true,
              message: "Read denied",
              cleanupMessage: "Delete denied",
            },
          })
        : route.fulfill({ json: success });
    });
    await page.goto("/?view=smoke-tests");
    const section = panel(page);
    const button = section.getByRole("button", { name: "Run storage round trip" });
    await button.click();

    await expect(section).toContainText("Status: Failed");
    await expect(section).toContainText("Read denied");
    await expect(section).toContainText(
      "Cleanup failed; the object may remain: Delete denied",
    );
    await expect(section).toContainText(success.key);
    await expect(section).toContainText(success.bucket);
    await expect(button).toBeEnabled();

    await button.click();
    await expect(section).toContainText("Status: Succeeded");
    await expect(section).not.toContainText("Read denied");
    await expect(section).not.toContainText("Cleanup failed");
    expect(attempts).toBe(2);
  });

  test("reports successful write/read but failed cleanup without repeating the error", async ({
    page,
  }) => {
    await page.route(roundTripPath, (route) =>
      route.fulfill({
        status: 502,
        json: {
          status: "failed",
          bucket: success.bucket,
          key: success.key,
          federated: true,
          message: "Wrote and read back the object, but cleanup failed.",
          cleanupMessage: "Delete denied",
        },
      }),
    );
    await page.goto("/?view=smoke-tests");
    const section = panel(page);
    await section.getByRole("button", { name: "Run storage round trip" }).click();

    await expect(section).toContainText("Status: Failed");
    await expect(section).toContainText(
      "Wrote and read back the object, but cleanup failed.",
    );
    await expect(section.getByText(/Delete denied/)).toHaveCount(1);
    await expect(section).toContainText("Cleanup failed; the object may remain");
    await expect(section).toContainText(success.key);
  });

  for (const { name, status, body, message } of [
    {
      name: "disabled dev routes",
      status: 404,
      body: {},
      message: "Dev routes are not enabled on the API.",
    },
    {
      name: "a failure without storage context",
      status: 502,
      body: { status: "failed", message: "Storage is not configured." },
      message: "Storage is not configured.",
    },
    {
      name: "an invalid success response",
      status: 200,
      body: { status: "ok" },
      message: "The API returned a storage round trip in an unrecognised shape.",
    },
  ]) {
    test(`reports ${name}`, async ({ page }) => {
      await page.route(roundTripPath, (route) => route.fulfill({ status, json: body }));
      await page.goto("/?view=smoke-tests");
      const section = panel(page);
      const button = section.getByRole("button", { name: "Run storage round trip" });
      await button.click();

      await expect(section).toContainText("Status: Failed");
      await expect(section).toContainText(message);
      await expect(section.locator("dt")).toHaveCount(0);
      await expect(button).toBeEnabled();
    });
  }
});
