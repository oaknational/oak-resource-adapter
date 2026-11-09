// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { userEvent } from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ResourceAdapterLauncher,
  type ResourceAdapterLauncherAccount,
} from "./ResourceAdapterLauncher.js";
import { rememberOnboardingTrip } from "./onboardingTrip.js";
import type { ResourceAdapterCapability } from "./publicTypes.js";

const worksheet: ResourceAdapterCapability = {
  id: "worksheetScaffolding",
  label: "Add extra scaffolding",
  resourceType: "worksheet",
};

const lesson = { lessonSlug: "adding-fractions", programmeSlug: "maths-primary-ks2" };

const callbacks = {
  onFinishSetup: vi.fn(),
  onSelectCapability: vi.fn(),
  onSignIn: vi.fn(),
};

function launcher(
  account: ResourceAdapterLauncherAccount,
  capabilities: readonly ResourceAdapterCapability[] = [worksheet],
) {
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceAdapterLauncher
        account={account}
        capabilities={capabilities}
        lesson={lesson}
        {...callbacks}
      />
    </OakThemeProvider>
  );
}

function renderLauncher(...args: Parameters<typeof launcher>) {
  return { ...callbacks, ...render(launcher(...args)) };
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ResourceAdapterLauncher", () => {
  it("asks a signed-out teacher to sign in, remembering the lesson", async () => {
    const { onFinishSetup, onSignIn } = renderLauncher("signedOut");

    expect(
      screen.getByRole("region", { name: "Sign in to create more with Aila" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onFinishSetup).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
  });

  it("asks a teacher who needs setup to finish it, remembering the lesson", async () => {
    const { onFinishSetup } = renderLauncher("needsSetup");

    expect(
      screen.getByRole("region", { name: "Finish setting up your account" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(onFinishSetup).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(1);
  });

  it("shows only the capability button to a ready teacher", () => {
    renderLauncher("ready");

    expect(screen.getByRole("button", { name: worksheet.label })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders nothing for a ready teacher with no capabilities", () => {
    const { container } = renderLauncher("ready", []);

    expect(container).toBeEmptyDOMElement();
  });

  it("tells a teacher back from onboarding that they are all set", () => {
    rememberOnboardingTrip(lesson);
    renderLauncher("ready");

    expect(screen.getByRole("status")).toHaveTextContent("You're all set.");
    expect(screen.getByRole("button", { name: worksheet.label })).toBeVisible();
    expect(sessionStorage.length).toBe(0);
  });

  it("says when a teacher comes back from onboarding still needing setup", async () => {
    rememberOnboardingTrip(lesson);
    const { onFinishSetup } = renderLauncher("needsSetup");

    expect(
      screen.getByRole("region", { name: "Your account setup was not completed" }),
    ).toBeVisible();
    expect(sessionStorage.length).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onFinishSetup).toHaveBeenCalledOnce();
  });

  it("keeps the trip while the teacher is still signed out", () => {
    rememberOnboardingTrip(lesson);
    renderLauncher("signedOut");

    expect(sessionStorage.length).toBe(1);
  });

  it("says setup was not completed when a signed-out teacher signs in without remounting", () => {
    rememberOnboardingTrip(lesson);
    const { rerender } = renderLauncher("signedOut");
    rerender(launcher("needsSetup"));

    expect(
      screen.getByRole("region", { name: "Your account setup was not completed" }),
    ).toBeVisible();
  });

  it("renders the same markup on the server whether or not a trip was recorded", () => {
    const withoutTrip = renderToString(launcher("ready"));
    rememberOnboardingTrip(lesson);

    expect(renderToString(launcher("ready"))).toBe(withoutTrip);
  });

  it("ignores a trip that started from another lesson", () => {
    rememberOnboardingTrip({ ...lesson, lessonSlug: "subtracting-fractions" });
    renderLauncher("needsSetup");

    expect(
      screen.getByRole("region", { name: "Finish setting up your account" }),
    ).toBeVisible();
  });

  it("shows the usual prompt when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { onFinishSetup } = renderLauncher("needsSetup");

    expect(
      screen.getByRole("region", { name: "Finish setting up your account" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onFinishSetup).toHaveBeenCalledOnce();
  });
});
