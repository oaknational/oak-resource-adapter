import { expect, test } from "@playwright/test";

test("shows the API state, a capability-based trigger, and the adapter sidebar", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("status")).toHaveText("API /health: Healthy");
  await expect(
    page.getByRole("heading", { name: "Create more with Aila" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create more with AI" }).click();

  const sidebar = page.getByRole("dialog", { name: "Create more with Aila" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toContainText("Hello, World!");
  await expect(sidebar).toContainText("Adapt worksheet");
});
