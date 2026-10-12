import { expect, test } from "@playwright/test";

import { signIn } from "./helpers.js";

const isAllowanceRequest = (url: URL) => url.pathname.endsWith("/allowance.get");

const limitedAllowance = {
  tier: "limited",
  remaining: 2,
  limit: 3,
  resetsAt: "2027-01-01T00:00:00.000Z",
};

test("retries an unavailable access check and refreshes when the panel opens", async ({
  page,
}) => {
  let available = false;
  let requests = 0;
  await page.route(isAllowanceRequest, async (route) => {
    requests += 1;
    if (!available) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: [{ result: { data: limitedAllowance } }] });
  });
  await signIn(page);
  await page.getByRole("button", { name: "Access: Unavailable" }).click();
  const panel = page.getByRole("region", { name: "ORA access" });
  await expect(panel.getByRole("alert")).toContainText("Access could not be checked");

  available = true;
  await panel.getByRole("button", { name: "Try again" }).click();
  const indicator = page.getByRole("button", { name: "Access: Limited" });
  await expect(indicator).toBeVisible();
  await expect(panel).toContainText("2 of 3");
  await expect(panel).toContainText("pnpm access:grant user_");

  const beforeClosing = requests;
  await indicator.click();
  await expect(panel).toBeHidden();
  expect(requests).toBe(beforeClosing);

  await indicator.click();
  await expect.poll(() => requests).toBeGreaterThan(beforeClosing);
  await expect(panel).toContainText("2 of 3");
});

test("never shows the access indicator to an account with full access", async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isAllowanceRequest, async (route) => {
    await held;
    await route.fulfill({ json: [{ result: { data: { tier: "full" } } }] });
  });
  const checking = page.waitForRequest((request) =>
    isAllowanceRequest(new URL(request.url())),
  );
  await signIn(page);
  await checking;
  const indicator = page.getByRole("button", { name: /^Access:/ });
  await expect(indicator).toHaveCount(0);

  const answered = page.waitForResponse((response) =>
    isAllowanceRequest(new URL(response.url())),
  );
  release();
  await answered;
  await expect(indicator).toHaveCount(0);
});
