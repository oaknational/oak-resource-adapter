// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { userEvent } from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ResourceAdapterLauncher,
  type ResourceAdapterLauncherProps,
} from "./ResourceAdapterLauncher.js";
import { rememberOnboardingTrip } from "./onboardingTrip.js";
import type { ResourceAdapterCapability } from "./publicTypes.js";

const worksheet: ResourceAdapterCapability = {
  id: "worksheetScaffolding",
  label: "Scaffold practice tasks",
  resourceType: "worksheet",
};

const lesson = { lessonSlug: "adding-fractions", programmeSlug: "maths-primary-ks2" };

const callbacks = {
  onAnalyticsEvent: vi.fn(),
  onFinishSetup: vi.fn(),
  onSelectCapability: vi.fn(),
  onSignIn: vi.fn(),
};

type Overrides = Partial<
  Pick<
    ResourceAdapterLauncherProps<ResourceAdapterCapability>,
    "available" | "capabilities" | "teachingMaterials"
  >
>;

function launcher(
  account: ResourceAdapterLauncherProps["account"],
  overrides: Overrides = {},
) {
  return (
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceAdapterLauncher
        account={account}
        available={true}
        capabilities={[worksheet]}
        lesson={lesson}
        teachingMaterials={[]}
        {...callbacks}
        {...overrides}
      />
    </OakThemeProvider>
  );
}

function renderLauncher(...args: Parameters<typeof launcher>) {
  return { ...callbacks, ...render(launcher(...args)) };
}

async function choose(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "Adapt with AI" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ResourceAdapterLauncher", () => {
  it("opens a capability for a ready teacher", async () => {
    const { onAnalyticsEvent, onSelectCapability } = renderLauncher("ready");
    await choose(worksheet.label);

    expect(onSelectCapability).toHaveBeenCalledWith(worksheet);
    expect(onAnalyticsEvent).toHaveBeenLastCalledWith({
      name: "Resource Adapter Opened",
      componentType: "lesson_ai_menu_item",
      capabilityId: "worksheetScaffolding",
      packageVersion: expect.any(String),
    });
  });

  it("asks a signed-out teacher to sign in, remembering the lesson", async () => {
    const { onAnalyticsEvent, onFinishSetup, onSignIn } = renderLauncher("signedOut");
    await choose("Sign in to adapt");

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(onFinishSetup).not.toHaveBeenCalled();
    expect(sessionStorage).toHaveLength(1);
    expect(onAnalyticsEvent).toHaveBeenLastCalledWith({
      name: "Adapt Onboarding Selected",
      componentType: "lesson_ai_menu_item",
      accountState: "signedOut",
      packageVersion: expect.any(String),
    });
  });

  it("asks a teacher who needs setup to finish it, remembering the lesson", async () => {
    const { onFinishSetup } = renderLauncher("needsSetup", { capabilities: [] });
    await choose("Finish setup to adapt");

    expect(onFinishSetup).toHaveBeenCalledOnce();
    expect(sessionStorage).toHaveLength(1);
  });

  it.each(["signedOut", "needsSetup"] as const)(
    "offers %s teachers only Create with AI when ORA has nothing for the lesson",
    async (account) => {
      renderLauncher(account, {
        available: false,
        capabilities: [],
        teachingMaterials: ["additional-glossary"],
      });
      await userEvent.click(screen.getByRole("button", { name: "Adapt with AI" }));

      expect(
        screen.queryByRole("group", { name: "Adapt with AI" }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Create with AI" })).toBeVisible();
    },
  );

  it.each(["signedOut", "needsSetup", "ready"] as const)(
    "renders nothing for %s teachers when neither ORA nor labs has anything",
    (account) => {
      const { container } = renderLauncher(account, {
        available: false,
        capabilities: [],
      });

      expect(container).toBeEmptyDOMElement();
    },
  );

  it("shows no status to a ready teacher who didn't come from onboarding", () => {
    renderLauncher("ready");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tells a teacher back from onboarding that their account is ready", () => {
    rememberOnboardingTrip(lesson);
    renderLauncher("ready");

    expect(screen.getByRole("status")).toHaveTextContent("Your account is ready.");
    expect(screen.getByRole("button", { name: "Adapt with AI" })).toBeVisible();
    expect(sessionStorage).toHaveLength(0);
  });

  it("forgets the trip when a teacher comes back still needing setup", () => {
    rememberOnboardingTrip(lesson);
    renderLauncher("needsSetup");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(sessionStorage).toHaveLength(0);
  });

  it("keeps the trip while the teacher is still signed out", () => {
    rememberOnboardingTrip(lesson);
    renderLauncher("signedOut");

    expect(sessionStorage).toHaveLength(1);
  });

  it("renders the same markup on the server whether or not a trip was recorded", () => {
    const withoutTrip = renderToString(launcher("ready"));
    rememberOnboardingTrip(lesson);

    expect(renderToString(launcher("ready"))).toBe(withoutTrip);
  });

  it("ignores a trip that started from another lesson", () => {
    rememberOnboardingTrip({ ...lesson, lessonSlug: "subtracting-fractions" });
    renderLauncher("ready");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("still sends the teacher to setup when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { onFinishSetup } = renderLauncher("needsSetup");
    await choose("Finish setup to adapt");

    expect(onFinishSetup).toHaveBeenCalledOnce();
  });
});
