// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "./ResourceAdapterDialog.js";
import { getResourceAdapterFeatureFlags } from "./getResourceAdapterFeatureFlags.js";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

// The flag request itself is covered by getResourceAdapterFeatureFlags.test.ts,
// so these tests own only what the dialog does with the result.
vi.mock("./getResourceAdapterFeatureFlags.js", () => ({
  getResourceAdapterFeatureFlags: vi.fn(),
}));

const getFeatureFlagsMock = vi.mocked(getResourceAdapterFeatureFlags);

const smokeTestFlag = "feature-flags-smoke-test-enabled";
const apiBaseUrl = "https://resource-adapter-api.example";
const getToken = async () => "clerk-token";

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

function dialogProps(
  overrides: Partial<ResourceAdapterDialogProps> = {},
): ResourceAdapterDialogProps {
  return {
    apiBaseUrl,
    capabilities: [capability],
    getToken,
    isOpen: true,
    lesson,
    onClose: vi.fn(),
    ...overrides,
  };
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

function renderDialog(overrides: Partial<ResourceAdapterDialogProps> = {}) {
  const props = dialogProps(overrides);
  const { rerenderWithTheme } = renderWithTheme(<ResourceAdapterDialog {...props} />);

  return {
    props,
    rerender(nextOverrides: Partial<ResourceAdapterDialogProps>) {
      rerenderWithTheme(<ResourceAdapterDialog {...props} {...nextOverrides} />);
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getFeatureFlagsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ResourceAdapterDialog", () => {
  describe("when open", () => {
    it("presents the adapter as a labelled dialog", () => {
      renderDialog();

      expect(
        screen.getByRole("dialog", { name: "Create more with Aila" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: "Create more with Aila" }),
      ).toBeInTheDocument();
    });

    it("renders the lesson and its capability while nothing throws", () => {
      renderDialog();

      const dialog = screen.getByRole("dialog", { name: "Create more with Aila" });
      expect(within(dialog).getByText("Adding fractions")).toBeVisible();
      expect(within(dialog).getByText("Adapt worksheet")).toBeVisible();
    });

    it("announces only the first capability while the picker is unbuilt", () => {
      renderDialog({
        capabilities: [capability, { ...capability, label: "Adapt starter quiz" }],
      });

      expect(screen.getByText("Adapt worksheet")).toBeInTheDocument();
      expect(screen.queryByText("Adapt starter quiz")).not.toBeInTheDocument();
    });

    it("omits the capability line when the host has none to offer", () => {
      renderDialog({ capabilities: [] });

      expect(screen.queryByText(/Available capability/)).not.toBeInTheDocument();
      expect(screen.getByText(lesson.title)).toBeInTheDocument();
    });
  });

  describe("feature flags", () => {
    it("requests flags with the host token and base URL", async () => {
      const { props } = renderDialog();

      await waitFor(() => {
        expect(getFeatureFlagsMock).toHaveBeenCalledWith({
          apiBaseUrl: props.apiBaseUrl,
          getToken: props.getToken,
        });
      });
    });

    it("reveals flagged content once an enabled flag arrives", async () => {
      getFeatureFlagsMock.mockResolvedValue([smokeTestFlag]);
      renderDialog();

      expect(
        await screen.findByText(/New Resource Adapter UI can be rendered here/),
      ).toBeInTheDocument();
    });

    it("hides flagged content while the flag is disabled", async () => {
      getFeatureFlagsMock.mockResolvedValue(["some-other-flag"]);
      renderDialog();

      await waitFor(() => {
        expect(getFeatureFlagsMock).toHaveBeenCalled();
      });
      expect(
        screen.queryByText(/New Resource Adapter UI can be rendered here/),
      ).not.toBeInTheDocument();
    });

    // A flag outage must not take the dialog down with it: teachers still get
    // the base experience, minus anything gated.
    it("keeps the dialog usable and reports a failed flag request", async () => {
      const error = new Error("service unavailable");
      const onError = vi.fn();
      getFeatureFlagsMock.mockRejectedValue(error);

      renderDialog({ onError });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(error, { componentStack: null });
      });
      expect(screen.getByText(lesson.title)).toBeInTheDocument();
      expect(
        screen.queryByText(/New Resource Adapter UI can be rendered here/),
      ).not.toBeInTheDocument();
    });

    it("survives a host error handler that throws", async () => {
      getFeatureFlagsMock.mockRejectedValue(new Error("service unavailable"));
      const onError = vi.fn(() => {
        throw new Error("host handler broke");
      });

      renderDialog({ onError });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
      expect(screen.getByText(lesson.title)).toBeInTheDocument();
    });
  });

  describe("when closed", () => {
    it("renders no dialog", () => {
      renderDialog({ isOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("requests no flags", () => {
      renderDialog({ isOpen: false });

      expect(getFeatureFlagsMock).not.toHaveBeenCalled();
    });

    it("refetches flags on reopening rather than trusting the previous answer", async () => {
      const { rerender } = renderDialog();
      await waitFor(() => {
        expect(getFeatureFlagsMock).toHaveBeenCalledTimes(1);
      });

      rerender({ isOpen: false });
      rerender({ isOpen: true });

      await waitFor(() => {
        expect(getFeatureFlagsMock).toHaveBeenCalledTimes(2);
      });
    });

    // Closing mid-request must not let the late answer paint flagged content
    // over a dialog the teacher has already dismissed.
    it("discards a flag response that lands after closing", async () => {
      let resolveFirstRequest: (flags: readonly string[]) => void = () => {};
      getFeatureFlagsMock
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirstRequest = resolve;
          }),
        )
        // Leaving the reopened dialog's own request pending means any flagged
        // content on screen could only have come from the discarded response.
        .mockReturnValue(new Promise(() => {}));

      const { rerender } = renderDialog();
      rerender({ isOpen: false });
      resolveFirstRequest([smokeTestFlag]);
      rerender({ isOpen: true });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      expect(
        screen.queryByText(/New Resource Adapter UI can be rendered here/),
      ).not.toBeInTheDocument();
    });
  });

  describe("dismissal", () => {
    it("hands closing back to the host", async () => {
      const onClose = vi.fn();
      renderDialog({ onClose });

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // The dialog is presentational about its own visibility: the host owns
    // `isOpen`, so closing must not be self-applied.
    it("stays open until the host says otherwise", async () => {
      renderDialog();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("crash containment", () => {
    it("shows the fallback inside the still-open modal when content crashes", () => {
      renderDialog({ lesson: crashableLesson({ crash: true }) });

      const dialog = screen.getByRole("dialog", { name: "Create more with Aila" });
      expect(
        within(dialog).getByTestId("resource-adapter-error-fallback"),
      ).toBeVisible();
      expect(
        within(dialog).getByRole("heading", { name: "Create more with Aila" }),
      ).toBeVisible();
    });

    it("recovers when the dialog is closed and reopened", () => {
      const flag = { crash: true };
      const crashable = crashableLesson(flag);

      const { rerender } = renderDialog({ lesson: crashable });
      expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

      flag.crash = false;
      rerender({ isOpen: false });
      rerender({ isOpen: true });

      expect(
        screen.queryByTestId("resource-adapter-error-fallback"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Adding fractions")).toBeVisible();
    });

    it("recovers when the lesson changes", () => {
      const { rerender } = renderDialog({
        lesson: crashableLesson({ crash: true }),
      });
      expect(screen.getByTestId("resource-adapter-error-fallback")).toBeVisible();

      rerender({ lesson: { ...lesson, lessonSlug: "subtracting-fractions" } });

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
            {...dialogProps({ capabilities: shellCrashingCapabilities() })}
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

      renderDialog({ capabilities: shellCrashingCapabilities(), onClose });

      const fallback = screen.getByTestId("resource-adapter-dialog-fallback");

      fireEvent.click(within(fallback).getByRole("button", { name: "Dismiss" }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("gives both shell fallback actions an explicit button type", () => {
      renderDialog({ capabilities: shellCrashingCapabilities() });

      // Without it the default inside a host form would be submit.
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
      const dialog = (
        capabilities: readonly ResourceAdapterCapability[],
        isOpen: boolean,
      ) => (
        <>
          <button type="button">Create more with AI</button>
          <ResourceAdapterDialog {...dialogProps({ capabilities, isOpen })} />
        </>
      );

      const { rerenderWithTheme } = renderWithTheme(dialog(healthy, false));
      const trigger = screen.getByRole("button", { name: "Create more with AI" });
      trigger.focus();

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
      renderDialog({ capabilities: shellCrashingCapabilities() });

      const fallback = screen.getByTestId("resource-adapter-dialog-fallback");
      expect(within(fallback).queryAllByRole("heading")).toHaveLength(0);
    });

    it("renders nothing for a shell crash while the dialog is closed", () => {
      renderDialog({ capabilities: shellCrashingCapabilities(), isOpen: false });

      expect(
        screen.queryByTestId("resource-adapter-dialog-fallback"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("resource-adapter-error-fallback"),
      ).not.toBeInTheDocument();
    });
  });
});
