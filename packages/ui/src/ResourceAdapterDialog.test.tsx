// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "./ResourceAdapterDialog.js";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

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
