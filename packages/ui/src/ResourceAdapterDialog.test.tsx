// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

vi.mock("./reportClientError.js", () => ({
  reportClientError: vi.fn().mockResolvedValue(undefined),
}));

const lesson: LessonContext = {
  lessonSlug: "adding-fractions",
  programmeSlug: "ks2-maths",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const capability: ResourceAdapterCapability = {
  id: "worksheetAdapter",
  label: "Adapt worksheet",
  resourceType: "worksheet",
};

/** A lesson whose title throws when the flag is set. */
function crashableLesson(flag: { crash: boolean }): LessonContext {
  return {
    ...lesson,
    get title(): string {
      if (flag.crash) {
        throw new Error("lesson title unavailable");
      }
      return "Adding fractions";
    },
  };
}

/** Crashes the shell, which reads the first capability during its render. */
function shellCrashingCapabilities(): readonly ResourceAdapterCapability[] {
  return new Proxy([] as ResourceAdapterCapability[], {
    get() {
      throw new Error("dialog shell crash");
    },
  });
}

function renderWithTheme(children: ReactNode) {
  const result = render(
    <OakThemeProvider theme={oakDefaultTheme}>{children}</OakThemeProvider>,
  );

  return {
    ...result,
    rerenderWithTheme: (next: ReactNode) =>
      result.rerender(
        <OakThemeProvider theme={oakDefaultTheme}>{next}</OakThemeProvider>,
      ),
  };
}

describe("ResourceAdapterDialog", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders unchanged without the optional reporting props", () => {
    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={lesson}
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Create more with Aila" });
    expect(within(dialog).getByText("Adding fractions")).toBeVisible();
    expect(within(dialog).getByText("Adapt worksheet")).toBeVisible();
  });

  it("shows the fallback inside the still-open modal when content crashes", () => {
    const flag = { crash: true };
    const onClose = vi.fn();

    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={crashableLesson(flag)}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Create more with Aila" });
    expect(within(dialog).getByTestId("resource-adapter-error-fallback")).toBeVisible();
    expect(
      within(dialog).getByRole("heading", { name: "Create more with Aila" }),
    ).toBeVisible();
  });

  it("recovers when the dialog is closed and reopened", () => {
    const flag = { crash: true };
    const crashable = crashableLesson(flag);

    const { rerenderWithTheme } = renderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={crashable}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    flag.crash = false;
    rerenderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={false}
        lesson={crashable}
        onClose={() => {}}
      />,
    );
    rerenderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={crashable}
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Adding fractions")).toBeVisible();
  });

  it("recovers when the lesson changes", () => {
    const flag = { crash: true };

    const { rerenderWithTheme } = renderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={crashableLesson(flag)}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

    rerenderWithTheme(
      <ResourceAdapterDialog
        capabilities={[capability]}
        isOpen={true}
        lesson={{ ...lesson, lessonSlug: "subtracting-fractions" }}
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Adding fractions")).toBeVisible();
  });

  it("contains a dialog shell crash and takes focus, sparing the host page", () => {
    renderWithTheme(
      <>
        <p>host page content</p>
        <ResourceAdapterDialog
          capabilities={shellCrashingCapabilities()}
          isOpen={true}
          lesson={lesson}
          onClose={() => {}}
        />
      </>,
    );

    expect(screen.getByText("host page content")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
    expect(fallback).toHaveAttribute("role", "alert");
    expect(fallback).toHaveFocus();
  });

  it("lets the teacher dismiss the shell fallback, telling the host to close", () => {
    const onClose = vi.fn();

    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={shellCrashingCapabilities()}
        isOpen={true}
        lesson={lesson}
        onClose={onClose}
      />,
    );

    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");

    fireEvent.click(within(fallback).getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("gives both shell fallback actions an explicit button type", () => {
    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={shellCrashingCapabilities()}
        isOpen={true}
        lesson={lesson}
        onClose={() => {}}
      />,
    );

    // oak-components renders a bare `button`, which would submit a host form.
    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
    for (const name of ["Try again", "Dismiss"]) {
      expect(within(fallback).getByRole("button", { name })).toHaveAttribute(
        "type",
        "button",
      );
    }
  });

  it("returns focus to the host's trigger when the shell fallback is dismissed", () => {
    const healthy = [capability];

    // The real sequence: focus on the trigger as the dialog opens, then a crash.
    const { rerenderWithTheme } = renderWithTheme(
      <>
        <button type="button">Create more with AI</button>
        <ResourceAdapterDialog
          capabilities={healthy}
          isOpen={false}
          lesson={lesson}
          onClose={() => {}}
        />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "Create more with AI" });
    trigger.focus();

    const dialog = (
      capabilities: readonly ResourceAdapterCapability[],
      isOpen: boolean,
    ) => (
      <>
        <button type="button">Create more with AI</button>
        <ResourceAdapterDialog
          capabilities={capabilities}
          isOpen={isOpen}
          lesson={lesson}
          onClose={() => {}}
        />
      </>
    );

    rerenderWithTheme(dialog(healthy, true));
    rerenderWithTheme(dialog(shellCrashingCapabilities(), true));

    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
    expect(fallback).toHaveFocus();

    // Dismiss tells the host to close, and that clears the boundary.
    fireEvent.click(within(fallback).getByRole("button", { name: "Dismiss" }));
    rerenderWithTheme(dialog(healthy, false));

    expect(
      screen.queryByTestId("resource-adapter-dialog-fallback"),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("adds no heading of its own, leaving the host page's structure intact", () => {
    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={shellCrashingCapabilities()}
        isOpen={true}
        lesson={lesson}
        onClose={() => {}}
      />,
    );

    const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
    expect(within(fallback).queryAllByRole("heading")).toHaveLength(0);
  });

  it("renders nothing for a shell crash while the dialog is closed", () => {
    renderWithTheme(
      <ResourceAdapterDialog
        capabilities={shellCrashingCapabilities()}
        isOpen={false}
        lesson={lesson}
        onClose={() => {}}
      />,
    );

    expect(
      screen.queryByTestId("resource-adapter-dialog-fallback"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("resource-adapter-error-fallback"),
    ).not.toBeInTheDocument();
  });
});
