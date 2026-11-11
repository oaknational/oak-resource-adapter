// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "./ResourceAdapterDialog.js";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";
import { acceptTerms, getTermsState } from "./terms.js";
import { openWorksheetScaffolding } from "./worksheetScaffolding.js";

vi.mock("./terms.js", () => ({ acceptTerms: vi.fn(), getTermsState: vi.fn() }));

vi.mock("./worksheetScaffolding.js", () => ({
  acceptWorksheetScaffoldingReview: vi.fn(),
  applyWorksheetScaffoldingSuggestion: vi.fn(),
  enqueueWorksheetScaffoldingDismissal: vi.fn(),
  enqueueWorksheetScaffoldingRemoval: vi.fn(),
  getWorksheetScaffolding: vi.fn(),
  openWorksheetScaffolding: vi.fn(() => new Promise(() => {})),
  retryWorksheetScaffoldingReview: vi.fn(),
  undoWorksheetScaffoldingReview: vi.fn(),
}));

const capability: ResourceAdapterCapability = {
  id: "worksheetScaffolding",
  label: "Add extra scaffolding",
  resourceType: "worksheet",
};

const lesson: LessonContext = {
  availableResources: ["worksheet"],
  keyStageSlug: "ks2",
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  subjectSlug: "maths",
  title: "Adding fractions",
};

function crashingCapability(): ResourceAdapterCapability {
  return {
    ...capability,
    get label(): string {
      throw new Error("dialog shell crash");
    },
  };
}

function dialogProps(
  overrides: Partial<ResourceAdapterDialogProps> = {},
): ResourceAdapterDialogProps {
  return {
    apiBaseUrl: "https://resource-adapter-api.example",
    capability,
    getToken: async () => "clerk-token",
    isOpen: true,
    lesson,
    onClose: vi.fn(),
    onFinishSetup: vi.fn(),
    ...overrides,
  };
}

function renderWithTheme(children: ReactNode) {
  return render(
    <OakThemeProvider theme={oakDefaultTheme}>{children}</OakThemeProvider>,
  );
}

function renderDialog(overrides: Partial<ResourceAdapterDialogProps> = {}) {
  return renderWithTheme(<ResourceAdapterDialog {...dialogProps(overrides)} />);
}

beforeEach(() => {
  vi.mocked(getTermsState).mockResolvedValue({ accepted: true });
  vi.mocked(acceptTerms).mockResolvedValue({ accepted: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResourceAdapterDialog", () => {
  it("labels the dialog with the selected capability", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Add extra scaffolding" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Add extra scaffolding" }),
    ).toBeInTheDocument();
  });

  it("hands closing back to the host", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Close Modal" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reports the teacher closing the dialog", async () => {
    const onAnalyticsEvent = vi.fn();
    renderDialog({ onAnalyticsEvent });

    await userEvent.click(screen.getByRole("button", { name: "Close Modal" }));

    expect(onAnalyticsEvent).toHaveBeenCalledWith({
      capabilityId: "worksheetScaffolding",
      packageVersion: expect.any(String),
      name: "Resource Adapter Closed",
      componentType: "resource_adapter_dialog",
    });
  });

  it("contains a shell crash without removing host content", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithTheme(
      <>
        <p>Host page content</p>
        <ResourceAdapterDialog {...dialogProps({ capability: crashingCapability() })} />
      </>,
    );

    expect(screen.getByText("Host page content")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
    expect(fallback).toHaveFocus();
    expect(within(fallback).queryByRole("heading")).not.toBeInTheDocument();
  });

  it("keeps the shell fallback when the host rebuilds the capability prop", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = renderDialog({ capability: crashingCapability() });

    expect(screen.getByTestId("resource-adapter-dialog-fallback")).toBeVisible();
    result.rerender(
      <OakThemeProvider theme={oakDefaultTheme}>
        <ResourceAdapterDialog {...dialogProps({ capability: crashingCapability() })} />
      </OakThemeProvider>,
    );

    expect(screen.getByTestId("resource-adapter-dialog-fallback")).toBeVisible();
  });

  it("dismisses the shell fallback through the host callback", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    renderDialog({ capability: crashingCapability(), onClose });

    fireEvent.click(
      within(screen.getByTestId("resource-adapter-dialog-fallback")).getByRole(
        "button",
        { name: "Dismiss" },
      ),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ORA's terms in the dialog", () => {
  beforeEach(() => {
    vi.mocked(getTermsState).mockResolvedValue({ accepted: false });
  });

  it("shows the terms before the capability, with focus on their heading", async () => {
    renderDialog();

    const heading = await screen.findByRole("heading", {
      level: 3,
      name: "Before you adapt with AI",
    });
    expect(heading).toHaveFocus();
    expect(
      screen.getByRole("link", {
        name: /^terms and conditions ?\(opens in a new tab\)$/,
      }),
    ).toHaveAttribute("target", "_blank");
    expect(openWorksheetScaffolding).not.toHaveBeenCalled();
  });

  it("records acceptance and continues to the capability", async () => {
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Accept and continue" }),
    );

    await waitFor(() => expect(openWorksheetScaffolding).toHaveBeenCalledOnce());
    expect(acceptTerms).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
    expect(
      screen.queryByRole("heading", { name: "Before you adapt with AI" }),
    ).toBeNull();
  });

  it("keeps the terms and says so when acceptance is not recorded", async () => {
    vi.mocked(acceptTerms).mockRejectedValue(new Error("network"));
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Accept and continue" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save that. Try again.",
    );
    expect(openWorksheetScaffolding).not.toHaveBeenCalled();
  });

  it("asks the teacher to reload when the terms they saw are out of date", async () => {
    vi.mocked(acceptTerms).mockResolvedValue({ accepted: false });
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Accept and continue" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "These terms have changed. Reload the page to see the latest version.",
    );
    expect(openWorksheetScaffolding).not.toHaveBeenCalled();
  });

  it("goes back to the lesson without accepting", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(
      await screen.findByRole("button", { name: "Back to lesson" }),
    );

    expect(onClose).toHaveBeenCalledOnce();
    expect(acceptTerms).not.toHaveBeenCalled();
  });

  it("shows the terms again when the capability is refused for them", async () => {
    vi.mocked(getTermsState).mockResolvedValue({ accepted: true });
    vi.mocked(openWorksheetScaffolding).mockResolvedValueOnce({
      outcome: "needsTerms",
    });
    renderDialog();

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Before you adapt with AI",
      }),
    ).toBeVisible();
  });

  it("offers to check again when the check fails", async () => {
    vi.mocked(getTermsState)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ accepted: false });
    const onError = vi.fn();
    renderDialog({ onError });

    await userEvent.click(
      within(await screen.findByTestId("resource-adapter-terms-error")).getByRole(
        "button",
        { name: "Try again" },
      ),
    );

    expect(
      await screen.findByRole("heading", { name: "Before you adapt with AI" }),
    ).toBeVisible();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { componentStack: null });
  });
});
