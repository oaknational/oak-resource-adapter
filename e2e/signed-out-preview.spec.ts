import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import {
  chooseFromAiMenu,
  openAiMenu,
  signIn,
  waitForCapabilities,
  waitForCapabilityAvailability,
} from "./helpers.js";

// @deployment-safe criteria: docs/DEVELOPMENT.md, "Testing a deployed candidate".

test(
  "previews the signed-out menu for a signed-in tester",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await signIn(page);
    const availability = waitForCapabilityAvailability(page);
    await page.goto("/?lesson=adopting-different-perspectives&as=signed-out");
    expect((await availability).status()).toBe(200);

    const menu = await openAiMenu(page);
    const signInItem = menu.getByRole("menuitem", { name: "Sign in to adapt" });
    await expect(signInItem).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Scaffold practice tasks" }),
    ).toHaveCount(0);

    const capabilities = waitForCapabilities(page);
    await signInItem.click();
    expect((await capabilities).status()).toBe(200);
    await expect(
      (await openAiMenu(page)).getByRole("menuitem", {
        name: "Scaffold practice tasks",
      }),
    ).toBeVisible();
  },
);

for (const url of [
  "/?lesson=adopting-different-perspectives&as=signed-out",
  "/?view=edge-cases&case=unsupported-markup&as=signed-out",
]) {
  test(
    `leaves a shared preview when signing in: ${url}`,
    {
      tag: "@deployment-safe",
    },
    async ({ page }) => {
      await setupClerkTestingToken({ page });
      const availability = waitForCapabilityAvailability(page);
      await page.goto(url);
      expect((await availability).status()).toBe(200);
      await chooseFromAiMenu(page, "Sign in to adapt");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).not.toHaveURL(/as=signed-out/);
      const capabilities = waitForCapabilities(page);
      await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
      // The test helper establishes a session without completing the modal UI.
      await page.evaluate(() => window.Clerk.closeSignIn());
      expect((await capabilities).status()).toBe(200);
      await expect(page.getByRole("dialog")).toBeHidden();
      if (url.includes("case=unsupported-markup")) {
        await expect(page.getByTestId("capability-outcome")).toHaveText(
          /^The capabilities endpoint returned [1-9]\d* capabilities\.$/,
        );
      }
      const menu = await openAiMenu(page);
      await expect(
        menu.getByRole("menuitem", { name: "Scaffold practice tasks", exact: true }),
      ).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: "Sign in to adapt" }),
      ).toHaveCount(0);
    },
  );

  test(
    `closes the adapter when Back restores preview mode: ${url}`,
    { tag: "@deployment-safe" },
    async ({ page }) => {
      await signIn(page);
      await page.goto(url);
      const capabilities = waitForCapabilities(page);
      await page.getByRole("link", { name: "Signed-in view", exact: true }).click();
      expect((await capabilities).status()).toBe(200);
      await page.route(
        "**/adapter-proxy/trpc/internal/worksheetScaffolding.open*",
        (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
      );
      await chooseFromAiMenu(page, "Scaffold practice tasks");
      await expect(page.getByRole("dialog", { name: "Aila | Oak's AI" })).toBeVisible();

      const availability = waitForCapabilityAvailability(page);
      await page.goBack();
      await expect(page).toHaveURL(/as=signed-out/);
      expect((await availability).status()).toBe(200);
      await expect(page.getByRole("dialog", { name: "Aila | Oak's AI" })).toHaveCount(
        0,
      );
      await expect(
        (await openAiMenu(page)).getByRole("menuitem", { name: "Sign in to adapt" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      const capabilitiesAgain = waitForCapabilities(page);
      await page.goForward();
      expect((await capabilitiesAgain).status()).toBe(200);
      await expect(
        (await openAiMenu(page)).getByRole("menuitem", {
          name: "Scaffold practice tasks",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Aila | Oak's AI" })).toHaveCount(
        0,
      );
    },
  );
}

test(
  "preserves the signed-out preview across harness sections",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await signIn(page);
    await page.goto("/?lesson=adopting-different-perspectives&as=signed-out");
    const sections = page.getByRole("navigation", { name: "Harness sections" });
    for (const section of ["Edge cases", "Capabilities", "Transformations"]) {
      await sections.getByRole("link", { name: section, exact: true }).click();
      await expect(page).toHaveURL(/as=signed-out/);
    }
    await page
      .getByRole("navigation", { name: "Transformation fixtures" })
      .getByRole("link", { name: /The River Nile/ })
      .click();
    await expect(page).toHaveURL(/lesson=the-river-nile/);
    await expect(page).toHaveURL(/as=signed-out/);
    await sections.getByRole("link", { name: "Exports", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Export mode" })
      .getByRole("link", { name: "Stored downloads" })
      .click();
    await expect(page).toHaveURL(/mode=stored-downloads/);
    await expect(page).toHaveURL(/as=signed-out/);
    await sections.getByRole("link", { name: "Try ORA", exact: true }).click();
    await expect(
      (await openAiMenu(page)).getByRole("menuitem", { name: "Sign in to adapt" }),
    ).toBeVisible();
  },
);

for (const signedOut of [false, true]) {
  test(
    `ignores a stale ${signedOut ? "availability" : "capabilities"} response after switching view`,
    {
      tag: "@deployment-safe",
    },
    async ({ page }) => {
      await signIn(page);
      await expect(
        page.getByRole("button", { name: "Adapt with AI", exact: true }),
      ).toBeVisible();
      const pending = Promise.withResolvers<void>();
      const started = Promise.withResolvers<void>();
      const delivered = Promise.withResolvers<void>();
      const delayedProcedure = signedOut ? "available" : "get";
      await page.route("**/adapter-proxy/trpc/v1/capabilities.*", async (route) => {
        const available = route.request().url().includes("capabilities.available");
        const delayed = route
          .request()
          .url()
          .includes(`capabilities.${delayedProcedure}`);
        if (delayed) {
          started.resolve();
          await pending.promise;
        }
        await route.fulfill({
          json: [
            {
              result: {
                data: available
                  ? { available: true, teachingMaterials: [] }
                  : {
                      account: {
                        state: "ready",
                        tier: "full",
                        inCopyrightRegion: true,
                      },
                      capabilities: [
                        {
                          id: "worksheetScaffolding",
                          label: "Scaffold practice tasks",
                          resourceType: "worksheet",
                        },
                      ],
                      available: true,
                      teachingMaterials: [],
                    },
              },
            },
          ],
        });
        if (delayed) delivered.resolve();
      });

      try {
        await page.goto(
          `/?view=edge-cases&case=unsupported-markup${signedOut ? "&as=signed-out" : ""}`,
        );
        await started.promise;
        await page
          .getByRole("link", {
            name: signedOut ? "Signed-in view" : "Signed-out view",
            exact: true,
          })
          .click();
        const outcome = page.getByTestId("capability-outcome");
        const expected = signedOut
          ? "The capabilities endpoint returned 1 capabilities."
          : "Capabilities state: signedOut.";
        await expect(outcome).toHaveText(expected);
        const response = page.waitForResponse((candidate) =>
          candidate.url().includes(`capabilities.${delayedProcedure}`),
        );
        pending.resolve();
        await (await response).finished();
        await delivered.promise;
        // Let the released fetch and its React update reach the screen.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await expect(outcome).toHaveText(expected);
        const menu = await openAiMenu(page);
        await expect(
          menu.getByRole("menuitem", { name: "Scaffold practice tasks" }),
        ).toHaveCount(signedOut ? 1 : 0);
        await expect(
          menu.getByRole("menuitem", { name: "Sign in to adapt" }),
        ).toHaveCount(signedOut ? 0 : 1);
      } finally {
        pending.resolve();
        await page.unrouteAll({ behavior: "wait" });
      }
    },
  );
}
