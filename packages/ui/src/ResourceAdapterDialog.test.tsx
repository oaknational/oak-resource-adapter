import { render, screen, waitFor } from "@testing-library/react";
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

const lesson: LessonContext = {
  lessonSlug: "adding-fractions",
  programmeSlug: "maths-primary-ks2",
  title: "Adding fractions",
  subjectSlug: "maths",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const worksheetCapability: ResourceAdapterCapability = {
  id: "worksheetAdapter",
  label: "Adapt worksheet",
  resourceType: "worksheet",
};

function renderDialog(overrides: Partial<ResourceAdapterDialogProps> = {}) {
  const props: ResourceAdapterDialogProps = {
    apiBaseUrl: "https://resource-adapter-api.example",
    capabilities: [worksheetCapability],
    getToken: async () => "clerk-token",
    isOpen: true,
    lesson,
    onClose: vi.fn(),
    ...overrides,
  };

  const { rerender } = render(
    <OakThemeProvider theme={oakDefaultTheme}>
      <ResourceAdapterDialog {...props} />
    </OakThemeProvider>,
  );

  return {
    props,
    rerender(nextOverrides: Partial<ResourceAdapterDialogProps>) {
      rerender(
        <OakThemeProvider theme={oakDefaultTheme}>
          <ResourceAdapterDialog {...props} {...nextOverrides} />
        </OakThemeProvider>,
      );
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getFeatureFlagsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.resetAllMocks();
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

    it("names the lesson being adapted", () => {
      renderDialog();

      expect(screen.getByText(lesson.title)).toBeInTheDocument();
    });

    it("names the available capability", () => {
      renderDialog();

      expect(screen.getByText("Adapt worksheet")).toBeInTheDocument();
    });

    it("announces only the first capability while the picker is unbuilt", () => {
      renderDialog({
        capabilities: [
          worksheetCapability,
          { ...worksheetCapability, label: "Adapt starter quiz" },
        ],
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
    it("requests flags with the host token and endpoint", async () => {
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
});
