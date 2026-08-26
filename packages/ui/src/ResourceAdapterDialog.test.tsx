// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import type { ResourceDocument } from "@oaknational/resource-document";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "./ResourceAdapterDialog.js";
import { getResourceAdapterSourceDocument } from "./getResourceAdapterSourceDocument.js";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

vi.mock("./getResourceAdapterSourceDocument.js", () => ({
  getResourceAdapterSourceDocument: vi.fn(),
}));

const getSourceDocumentMock = vi.mocked(getResourceAdapterSourceDocument);
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
  label: "Scaffold practice tasks",
  resourceType: "worksheet",
};

const sourceDocument: ResourceDocument = {
  schemaVersion: "0.1",
  id: "oak:worksheet:adding-fractions:pupil",
  profile: "worksheet.v0",
  language: "en-GB",
  metadata: { title: "Adding fractions worksheet" },
  content: [
    {
      id: "title",
      type: "heading",
      level: 1,
      content: [{ type: "text", text: "Adding fractions worksheet" }],
    },
    {
      id: "question-1",
      type: "question",
      label: "1",
      children: [
        {
          id: "question-1-text",
          type: "paragraph",
          content: [{ type: "text", text: "What is one half plus one quarter?" }],
        },
      ],
    },
  ],
  answers: [],
  assets: [],
  provenance: {
    source: { system: "oak", id: "adding-fractions" },
    producer: { name: "test", version: "1" },
  },
  diagnostics: [],
};

// The shell reads `label` only inside the boundary, so a throwing getter
// stands in for a crash the boundary has to contain.
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
    apiBaseUrl,
    capability,
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
  getSourceDocumentMock.mockResolvedValue(sourceDocument);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ResourceAdapterDialog", () => {
  it("labels the drawer with the explicitly selected capability", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", { name: "Scaffold practice tasks" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Scaffold practice tasks" }),
    ).toBeInTheDocument();
  });

  it("loads and renders the capability source document", async () => {
    const { props } = renderDialog();

    expect(screen.getByRole("status")).toHaveTextContent("Loading worksheet");
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(screen.getByText("What is one half plus one quarter?")).toBeVisible();
    expect(getSourceDocumentMock).toHaveBeenCalledWith({
      apiBaseUrl: props.apiBaseUrl,
      capabilityId: "worksheetAdapter",
      getToken: expect.any(Function),
      lesson: props.lesson,
    });
    await expect(getSourceDocumentMock.mock.calls[0]?.[0].getToken()).resolves.toBe(
      "clerk-token",
    );
  });

  it("reports a document failure and lets the teacher retry", async () => {
    const error = new Error("source unavailable");
    const onError = vi.fn();
    getSourceDocumentMock.mockRejectedValueOnce(error);
    renderDialog({ onError });

    const fallback = await screen.findByTestId(
      "resource-adapter-source-document-error",
    );
    expect(fallback).toHaveAttribute("role", "alert");
    expect(onError).toHaveBeenCalledWith(error, { componentStack: null });

    await userEvent.click(within(fallback).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(getSourceDocumentMock).toHaveBeenCalledTimes(2);
  });

  it("does not load a document while closed and loads it on opening", async () => {
    const { rerender } = renderDialog({ isOpen: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSourceDocumentMock).not.toHaveBeenCalled();

    rerender({ isOpen: true });
    await waitFor(() => expect(getSourceDocumentMock).toHaveBeenCalledOnce());
  });

  it("does not reload when the host rebuilds the lesson and token props", async () => {
    const { rerender } = renderDialog();

    await waitFor(() => expect(getSourceDocumentMock).toHaveBeenCalledOnce());
    rerender({ lesson: { ...lesson }, getToken: async () => "clerk-token" });

    await expect(
      screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).resolves.toBeVisible();
    expect(getSourceDocumentMock).toHaveBeenCalledOnce();
  });

  it("keeps the shell fallback when the host rebuilds the capability prop", () => {
    const { rerender } = renderDialog({ capability: crashingCapability() });

    expect(screen.getByTestId("resource-adapter-dialog-fallback")).toBeVisible();
    rerender({ capability: crashingCapability() });

    expect(screen.getByTestId("resource-adapter-dialog-fallback")).toBeVisible();
  });

  it("hands closing back to the host", async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("contains a shell crash without removing host content", () => {
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

  it("dismisses the shell fallback through the host callback", () => {
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
