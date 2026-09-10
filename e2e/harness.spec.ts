import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import {
  signIn,
  waitForCapabilities,
  waitForCapabilityAvailability,
} from "./helpers.js";

// @deployment-safe marks a spec as runnable against a deployed environment, which
// means two things: it writes no rows another run could see, and it depends on no
// local-only state. Untagged specs run only against CI's throwaway database.

const edgeCases = [
  {
    id: "worksheet-without-extraction",
    heading: "Oak has a worksheet, we have no data for it",
    outcome: "The capabilities endpoint returned 0 capabilities.",
    offersCreateMore: false,
  },
  {
    id: "extraction-without-worksheet",
    heading: "We have worksheet data, Oak has no worksheet",
    outcome: "The capabilities endpoint returned 0 capabilities.",
    offersCreateMore: false,
  },
  {
    id: "unsupported-markup",
    heading: "Worksheet data uses a feature we do not recognise",
    outcome: "The capabilities endpoint returned 1 capabilities.",
    offersCreateMore: true,
  },
  {
    id: "malformed-extraction",
    heading: "Worksheet data we cannot read at all",
    outcome: "The capabilities endpoint returned 1 capabilities.",
    offersCreateMore: true,
  },
] as const;

for (const { heading, id, offersCreateMore, outcome } of edgeCases) {
  test(
    `reports what OWA sees for: ${heading.toLowerCase()}`,
    {
      tag: "@deployment-safe",
    },
    async ({ page }) => {
      await signIn(page);

      // The same endpoint the eligible lessons use has to be consulted, so an
      // absent button proves an empty response rather than a skipped request.
      const capabilitiesResponse = waitForCapabilities(page);
      await page.goto(`/?view=edge-cases&case=${id}`);
      expect((await capabilitiesResponse).status()).toBe(200);

      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByTestId("capability-outcome")).toHaveText(outcome);
      await expect(
        page.getByRole("button", { name: "Add extra scaffolding" }),
      ).toHaveCount(offersCreateMore ? 1 : 0);
      await expect(
        page.getByRole("region", { name: "Sign in to create more with Aila" }),
      ).toHaveCount(0);
    },
  );
}

test(
  "falls back to the retry panel when the capabilities endpoint is unreachable",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await signIn(page);
    await page.goto("/?view=edge-cases&case=capabilities-unavailable");

    const fallback = page.getByRole("region", {
      name: "Create more with Aila is unavailable",
    });

    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
  },
);

test(
  "reveals skip navigation above the site header",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/");

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    const headerBoxBeforeFocus = await page.getByRole("banner").boundingBox();
    await page.keyboard.press("Tab");

    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    const headerBoxAfterFocus = await page.getByRole("banner").boundingBox();

    expect(headerBoxBeforeFocus).not.toBeNull();
    expect(headerBoxAfterFocus).not.toBeNull();
    expect(headerBoxAfterFocus!.y).toBe(headerBoxBeforeFocus!.y);
  },
);

// The crash section is not gated on authentication and the caught error goes no
// further than the harness logger, so this needs no session and writes nothing.
test(
  "contains a simulated adapter crash",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await page.goto("/?view=smoke-tests");

    const section = page.getByRole("region", { name: "Error boundary test" });
    await expect(section).toContainText("The adapter surface renders normally.");

    await section.getByRole("button", { name: "Simulate adapter crash" }).click();

    // The fallback replaces the crashed content...
    const fallback = section.getByTestId("resource-adapter-error-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("Create more with Aila is unavailable");
    // ...and the page around it is untouched.
    await expect(
      page.getByRole("heading", { level: 1, name: "Smoke tests" }),
    ).toBeVisible();

    // Try again re-catches while the crash is still simulated.
    await fallback.getByRole("button", { name: "Try again" }).click();
    await expect(section.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    await section.getByRole("button", { name: "Clear simulated crash" }).click();
    await expect(section).toContainText("The adapter surface renders normally.");
    await expect(section.getByTestId("resource-adapter-error-fallback")).toHaveCount(0);
  },
);

test(
  "offers signed-out visitors sign-in instead of the capability launcher",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    // Clerk's bot protection blocks an automated browser on a real domain, and
    // without it `isLoaded` never settles, so the panel renders nothing.
    await setupClerkTestingToken({ page });
    const availability = waitForCapabilityAvailability(page);
    await page.goto("/");
    expect((await availability).status()).toBe(200);

    const signInPrompt = page.getByRole("region", {
      name: "Sign in to create more with Aila",
    });

    await expect(signInPrompt).toBeVisible();
    await expect(signInPrompt.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Sign in" }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { exact: true, name: "Create more with Aila" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
  },
);

test(
  "leaves signed-out visitors alone when a lesson has nothing behind it",
  {
    tag: "@deployment-safe",
  },
  async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/?view=edge-cases&case=worksheet-without-extraction");

    // Settles only once the unauthenticated availability call has answered, so
    // the absences below are meaningful rather than merely early.
    await expect(page.getByTestId("capability-outcome")).toHaveText(
      "Capabilities state: signedOut.",
    );

    await expect(
      page.getByRole("region", { name: "Sign in to create more with Aila" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Add extra scaffolding" }),
    ).toHaveCount(0);
  },
);
