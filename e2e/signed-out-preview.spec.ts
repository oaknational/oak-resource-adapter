import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import {
  signIn,
  waitForCapabilities,
  waitForCapabilityAvailability,
} from "./helpers.js";

// @deployment-safe criteria: docs/DEVELOPMENT.md, "Testing a deployed candidate".

test(
  "previews the signed-out prompt for a signed-in tester",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await signIn(page);
    const availability = waitForCapabilityAvailability(page);
    await page.goto("/?lesson=adopting-different-perspectives&as=signed-out");
    expect((await availability).status()).toBe(200);

    const signInPrompt = page.getByRole("region", {
      name: "Sign in to create more with Aila",
    });
    await expect(signInPrompt).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "What teachers see in OWA Stand-in",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);

    const capabilities = waitForCapabilities(page);
    await signInPrompt.getByRole("button", { name: "Sign in" }).click();
    expect((await capabilities).status()).toBe(200);
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What teachers see in OWA Live", exact: true }),
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
      await page.goto(url);
      await page
        .getByRole("region", { name: "Sign in to create more with Aila" })
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page).not.toHaveURL(/as=signed-out/);
      await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
      // The test helper establishes a session without completing the modal UI.
      await page.evaluate(() => window.Clerk.closeSignIn());
      await expect(
        page.getByRole("button", { name: "Add extra scaffolding", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Sign in to create more with Aila" }),
      ).toHaveCount(0);
    },
  );

  test(
    `closes the adapter when Back restores preview mode: ${url}`,
    { tag: "@deployment-safe" },
    async ({ page }) => {
      await signIn(page);
      await page.goto(url);
      await page.getByRole("link", { name: "Signed-in teacher", exact: true }).click();
      await page.route(
        "**/adapter-proxy/trpc/internal/worksheetScaffolding.open*",
        (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
      );
      await page
        .getByRole("button", { name: "Add extra scaffolding", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Add extra scaffolding" }),
      ).toBeVisible();

      await page.goBack();
      await expect(page).toHaveURL(/as=signed-out/);
      await expect(
        page.getByRole("dialog", { name: "Add extra scaffolding" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Sign in to create more with Aila" }),
      ).toBeVisible();

      await page.goForward();
      await expect(
        page.getByRole("button", { name: "Add extra scaffolding", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("dialog", { name: "Add extra scaffolding" }),
      ).toHaveCount(0);
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
      page.getByRole("region", { name: "Sign in to create more with Aila" }),
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
        page.getByRole("button", { name: "Add extra scaffolding" }),
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
                  ? { available: true }
                  : {
                      capabilities: [
                        {
                          id: "worksheetScaffolding",
                          label: "Add extra scaffolding",
                          resourceType: "worksheet",
                        },
                      ],
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
            name: signedOut ? "Signed-in teacher" : "Signed-out visitor",
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
        await expect(
          page.getByRole("button", { name: "Add extra scaffolding" }),
        ).toHaveCount(signedOut ? 1 : 0);
      } finally {
        pending.resolve();
        await page.unrouteAll({ behavior: "wait" });
      }
    },
  );
}
