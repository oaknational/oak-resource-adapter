import { expect, test, type Page } from "@playwright/test";

const readyBody = {
  status: "ready",
  checks: {
    modelConfiguration: {
      label: "Model configuration",
      status: "ready",
      message: "Deterministic transport configured.",
    },
  },
};

function notReadyBody(code: string, message: string) {
  return {
    status: "not-ready",
    checks: {
      modelConfiguration: {
        label: "Model configuration",
        status: "not-ready",
        code,
        message,
      },
    },
  };
}

async function mockHealth(
  page: Page,
  {
    status = 200,
    body = readyBody,
    livenessStatus = 200,
    livenessBody = { status: "ok" },
  }: {
    status?: number;
    body?: unknown;
    livenessStatus?: number;
    livenessBody?: unknown;
  } = {},
) {
  await page.route("**/adapter-proxy/health", (route) =>
    route.fulfill({ status: livenessStatus, json: livenessBody }),
  );
  await page.route("**/adapter-proxy/health/ready", (route) =>
    route.fulfill({ status, json: body }),
  );
}

function toggle(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /^API:/ });
}

function indicator(page: Page) {
  return page.getByRole("banner").getByRole("status");
}

function panel(page: Page) {
  return page.getByRole("region", { name: "API status", exact: true });
}

test.describe("mocked API health", { tag: "@deployment-safe" }, () => {
  test("shows ready configuration separately from liveness", async ({ page }) => {
    await mockHealth(page);
    await page.goto("/");

    await expect(indicator(page)).toHaveText("API: Ready");
    await expect(panel(page)).toBeHidden();
    await toggle(page).click();
    await expect(
      panel(page).getByText("Liveness: Healthy", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Model configuration: Ready", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Deterministic transport configured.", { exact: true }),
    ).toBeVisible();
  });

  test("renders a legitimate 503 configuration failure", async ({ page }) => {
    const message = "OPENAI_API_KEY is not configured.";
    await mockHealth(page, {
      status: 503,
      body: notReadyBody("MISSING_OPENAI_API_KEY", message),
    });
    await page.goto("/");

    await expect(indicator(page)).toHaveText("API: Not ready");
    await toggle(page).click();
    await expect(
      panel(page).getByText("Liveness: Healthy", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Model configuration: Not ready", { exact: true }),
    ).toBeVisible();
    await expect(panel(page).getByText(message, { exact: true })).toBeVisible();
    await expect(
      panel(page).getByText("Readiness: Unavailable", { exact: true }),
    ).toHaveCount(0);
  });

  test("distinguishes unavailable readiness when the route is missing", async ({
    page,
  }) => {
    await mockHealth(page, { status: 404 });
    await page.goto("/");

    await expect(indicator(page)).toHaveText("API: Unavailable");
    await toggle(page).click();
    await expect(
      panel(page).getByText("Liveness: Healthy", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Readiness: Unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText(/Check the API deployment and reload to try again/),
    ).toBeVisible();
    await expect(panel(page).getByText(/Model configuration:/)).toHaveCount(0);
  });

  test("retains readiness when liveness is unavailable", async ({ page }) => {
    await mockHealth(page, { livenessStatus: 404 });
    await page.goto("/");
    await expect(indicator(page)).toHaveText("API: Ready");
    await toggle(page).click();
    await expect(
      panel(page).getByText("Liveness: Unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Model configuration: Ready", { exact: true }),
    ).toBeVisible();
  });

  test("fetches concurrently and shows checking until readiness resolves", async ({
    page,
  }) => {
    await mockHealth(page);
    await page.unroute("**/adapter-proxy/health/ready");
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/adapter-proxy/health/ready", async (route) => {
      await delayed;
      await route.fulfill({ json: readyBody });
    });

    try {
      await page.goto("/");
      await expect(indicator(page)).toHaveText("API: Checking");
      await toggle(page).click();
      await expect(
        panel(page).getByText("Liveness: Healthy", { exact: true }),
      ).toBeVisible();
      await expect(
        panel(page).getByText("Readiness: Checking", { exact: true }),
      ).toBeVisible();
      release();
      await expect(indicator(page)).toHaveText("API: Ready");
      await expect(
        panel(page).getByText("Model configuration: Ready", { exact: true }),
      ).toBeVisible();
    } finally {
      release();
    }
  });

  test("renders future checks without model-specific branching", async ({ page }) => {
    await mockHealth(page, {
      status: 503,
      body: {
        status: "not-ready",
        checks: {
          ...readyBody.checks,
          futureCatalogue: {
            label: "Curriculum catalogue",
            status: "not-ready",
            message: "The curriculum catalogue is not configured.",
          },
          futureStorage: {
            label: "Export storage",
            status: "ready",
            message: "Export storage configured.",
            code: "FUTURE_CHECK_READY",
          },
        },
      },
    });
    await page.goto("/");
    await expect(indicator(page)).toHaveText("API: Not ready");
    await toggle(page).click();
    await expect(
      panel(page).getByText("Model configuration: Ready", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Curriculum catalogue: Not ready", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("The curriculum catalogue is not configured.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Export storage: Ready", { exact: true }),
    ).toBeVisible();
    await expect(
      panel(page).getByText("Export storage configured.", { exact: true }),
    ).toBeVisible();
  });

  test("opens and closes by keyboard in a mobile-contained panel", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockHealth(page);
    await page.goto("/");
    await expect(indicator(page)).toHaveText("API: Ready");
    await toggle(page).focus();
    await expect(toggle(page)).toBeFocused();
    await toggle(page).press("Enter");
    await expect(panel(page)).toBeVisible();
    const box = await panel(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await toggle(page).press("Space");
    await expect(panel(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
  });

  test("the pill text and icon toggle exactly once, with Escape and outside dismissal", async ({
    page,
  }) => {
    await mockHealth(page);
    await page.goto("/");
    await expect(indicator(page)).toHaveText("API: Ready");
    for (const target of [
      toggle(page),
      toggle(page).locator("svg"),
      toggle(page).locator("span[aria-hidden='true']"),
    ]) {
      await target.click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
      await expect(panel(page)).toBeVisible();
      await target.click();
      await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
      await expect(panel(page)).toBeHidden();
    }
    await toggle(page).click();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();
    await toggle(page).click();
    await page.getByRole("heading", { level: 1 }).click();
    await expect(panel(page)).toBeHidden();
  });

  test("reload checks readiness again rather than keeping a stale ready state", async ({
    page,
  }) => {
    await mockHealth(page);
    await page.goto("/");
    await expect(indicator(page)).toHaveText("API: Ready");
    await page.unroute("**/adapter-proxy/health/ready");
    await page.route("**/adapter-proxy/health/ready", (route) =>
      route.fulfill({
        status: 503,
        json: notReadyBody(
          "MISSING_OPENAI_API_KEY",
          "OPENAI_API_KEY is not configured.",
        ),
      }),
    );
    await page.reload();
    await expect(indicator(page)).toHaveText("API: Not ready");
    await toggle(page).click();
    await expect(
      panel(page).getByText("OPENAI_API_KEY is not configured.", { exact: true }),
    ).toBeVisible();
  });
});

test("shows live local deterministic readiness through the harness proxy", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL),
    "Local deterministic configuration is not a deployment assumption.",
  );
  const readinessResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/adapter-proxy/health/ready",
  );
  await page.goto("/");
  expect((await readinessResponse).status()).toBe(200);
  await expect(indicator(page)).toHaveText("API: Ready");
  await toggle(page).click();
  await expect(
    panel(page).getByText("Liveness: Healthy", { exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByText("Deterministic transport configured.", { exact: true }),
  ).toBeVisible();
});
