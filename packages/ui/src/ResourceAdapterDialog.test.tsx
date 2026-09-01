// @vitest-environment jsdom
import { type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import type { ResourceDocument } from "@oaknational/resource-document";

import { ResourceAdapterDialog } from "./ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "./ResourceAdapterDialog.js";
import {
  applyWorksheetScaffoldingSuggestion,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
} from "./worksheetScaffolding.js";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";
import type { LessonContext, ResourceAdapterCapability } from "./publicTypes.js";

vi.mock("./worksheetScaffolding.js", () => ({
  applyWorksheetScaffoldingSuggestion: vi.fn(),
  getWorksheetScaffolding: vi.fn(),
  openWorksheetScaffolding: vi.fn(),
}));

const openWorksheetScaffoldingMock = vi.mocked(openWorksheetScaffolding);
const getWorksheetScaffoldingMock = vi.mocked(getWorksheetScaffolding);
const applySuggestionMock = vi.mocked(applyWorksheetScaffoldingSuggestion);
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
  id: "worksheetScaffolding",
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

function opened(state: WorksheetScaffoldingState) {
  return { outcome: "opened", state } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const readyWithSuggestion = {
  adaptationId: "adaptation-1",
  document: sourceDocument,
  job: {
    failureMessage: null,
    id: "job-1",
    kind: "suggestions.generate",
    status: "succeeded",
  },
  suggestions: [
    {
      id: "suggestion-1",
      kind: "scaffold-add-word-bank",
      label: "Add a word bank",
      params: { supportLevel: "low" },
      reason: "This question depends on recalling several topic words.",
      targetBlockId: "question-1",
    },
  ],
} as const;

const readyWithGroupedSuggestions = {
  ...readyWithSuggestion,
  suggestions: [
    readyWithSuggestion.suggestions[0],
    {
      id: "suggestion-2",
      kind: "scaffold-add-recall-questions",
      label: "Add recall questions",
      params: { supportLevel: "medium" },
      reason: "A short recall prompt would help pupils retrieve prior knowledge.",
      targetBlockId: "question-1",
    },
  ],
} as const;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  openWorksheetScaffoldingMock.mockResolvedValue(
    opened({
      adaptationId: "adaptation-1",
      document: sourceDocument,
      job: null,
      suggestions: [],
    }),
  );
  applySuggestionMock.mockResolvedValue({
    adaptationId: "adaptation-1",
    document: sourceDocument,
    job: {
      failureMessage: null,
      id: "job-1",
      kind: "suggestions.apply",
      status: "queued",
    },
    suggestions: [],
  });
  getWorksheetScaffoldingMock.mockResolvedValue({
    adaptationId: "adaptation-1",
    document: sourceDocument,
    job: null,
    suggestions: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("ResourceAdapterDialog", () => {
  it("labels the dialog with the explicitly selected capability", () => {
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

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading worksheet. Getting your worksheet ready.",
    );
    const spinner = screen.getByTestId("worksheet-scaffolding-loading-spinner");
    expect(spinner).toBeVisible();
    expect(spinner).toHaveStyle({ borderTopStyle: "solid" });
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(screen.getByText("What is one half plus one quarter?")).toBeVisible();
    expect(openWorksheetScaffoldingMock).toHaveBeenCalledWith({
      apiBaseUrl: props.apiBaseUrl,
      getToken: expect.any(Function),
      lesson: props.lesson,
    });
    await expect(
      openWorksheetScaffoldingMock.mock.calls[0]?.[0].getToken(),
    ).resolves.toBe("clerk-token");
  });

  it("keeps the workflow at a stable width inside the temporary modal", async () => {
    renderDialog();

    const worksheet = await screen.findByRole("article", {
      name: "Adding fractions worksheet",
    });
    const workflowContainer = worksheet.parentElement?.parentElement;

    expect(workflowContainer).toHaveStyle({ minWidth: "0", width: "100%" });
    expect(screen.getByTestId("modal-main-content")).toHaveStyle({
      scrollbarGutter: "stable",
    });
  });

  it("shows a suggestion beside its question and applies its stored parameters", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    const readyBanner = await screen.findByText("Scaffolds ready");
    expect(readyBanner).toBeVisible();
    expect(readyBanner.closest("[tabindex]")).toHaveStyle({
      position: "sticky",
      top: "0px",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Scaffolds ready. You can now review suggestions",
    );
    expect(
      screen.getByText("This question depends on recalling several topic words."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Add a word bank" }));

    expect(screen.getByTestId("worksheet-scaffolding-local-spinner")).toBeVisible();
    expect(screen.getByText("Working…")).toBeVisible();
    expect(applySuggestionMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      getToken: expect.any(Function),
      suggestionId: "suggestion-1",
    });
  });

  it("groups suggestions that target the same document point", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(readyWithGroupedSuggestions),
    );
    renderDialog();

    const group = await screen.findByRole("group", { name: "Suggested scaffolds" });

    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(
      within(group).getByRole("button", { name: "Add a word bank" }),
    ).toBeVisible();
    expect(
      within(group).getByRole("button", { name: "Add recall questions" }),
    ).toBeVisible();

    await userEvent.click(
      within(group).getByRole("button", { name: "Add a word bank" }),
    );

    expect(
      within(group).queryByRole("button", { name: "Add a word bank" }),
    ).not.toBeInTheDocument();
    expect(within(group).getByText("Working…")).toBeVisible();
    expect(
      within(group).getByRole("button", { name: "Add recall questions" }),
    ).toBeDisabled();
  });

  it("shows application progress at the document insertion point", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        ...readyWithSuggestion,
        suggestions: [{ ...readyWithSuggestion.suggestions[0], targetBlockId: null }],
      }),
    );
    renderDialog();

    const worksheet = await screen.findByRole("article", {
      name: "Adding fractions worksheet",
    });
    const group = screen.getByRole("group", { name: "Suggested scaffolds" });
    expect(group.compareDocumentPosition(worksheet)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await userEvent.click(
      within(group).getByRole("button", { name: "Add a word bank" }),
    );

    expect(within(group).getByText("Working…")).toBeVisible();
  });

  it("can start again from the action beneath the worksheet", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    const worksheet = await screen.findByRole("article", {
      name: "Adding fractions worksheet",
    });
    const startAgain = screen.getByRole("button", { name: "Start again" });
    expect(worksheet.compareDocumentPosition(startAgain)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await userEvent.click(startAgain);

    await waitFor(() =>
      expect(openWorksheetScaffoldingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ replacing: "adaptation-1" }),
      ),
    );
  });

  it("offers unfinished work back instead of opening the worksheet", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 2,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    renderDialog();

    expect(
      await screen.findByRole("heading", { name: "Carry on with this worksheet?" }),
    ).toBeVisible();
    expect(screen.getByText(/You added 2 scaffolds/)).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("loads the saved adaptation when the teacher carries on", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    getWorksheetScaffoldingMock.mockResolvedValue(readyWithSuggestion);
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Carry on" }));

    expect(getWorksheetScaffoldingMock).toHaveBeenCalledWith(
      expect.objectContaining({ adaptationId: "adaptation-9" }),
    );
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
  });

  it("shows resumed work while its suggestions are still being generated", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    getWorksheetScaffoldingMock.mockResolvedValue({
      adaptationId: "adaptation-9",
      document: sourceDocument,
      job: {
        failureMessage: null,
        id: "job-2",
        kind: "suggestions.generate",
        status: "running",
      },
      suggestions: [],
    });
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Carry on" }));

    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(screen.getByText("Finding useful scaffolds")).toBeVisible();
  });

  it("replaces the declined adaptation when the teacher starts from the original", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Start from the original" }),
    );

    await waitFor(() =>
      expect(openWorksheetScaffoldingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ replacing: "adaptation-9" }),
      ),
    );
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
  });

  it("replaces the failed adaptation when the teacher restarts", async () => {
    const resumable = {
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    } as const;
    const failed = opened({
      adaptationId: "adaptation-10",
      document: sourceDocument,
      job: {
        failureMessage: null,
        id: "job-1",
        kind: "suggestions.generate",
        status: "failed",
      },
      suggestions: [],
    });
    openWorksheetScaffoldingMock
      .mockResolvedValueOnce(resumable)
      .mockResolvedValueOnce(failed);
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Start from the original" }),
    );
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: "Start again" }));

    await waitFor(() => expect(openWorksheetScaffoldingMock).toHaveBeenCalledTimes(3));
    expect(openWorksheetScaffoldingMock.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ replacing: "adaptation-10" }),
    );
  });

  it("describes each suggestion button by the reason shown with it", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    const button = await screen.findByRole("button", { name: "Add a word bank" });
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      "This question depends on recalling several topic words.",
    );
  });

  it("moves focus to the status banner when the chosen suggestion disappears", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a word bank" }),
    );

    // The chosen button has gone, so focus must not fall back to the document.
    const banner = await screen.findByText("Applying scaffold");
    const focusTarget = banner.closest("[tabindex]");
    expect(focusTarget).not.toBeNull();
    expect(focusTarget).toHaveFocus();
  });

  it("shows the background application job as applying", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        adaptationId: "adaptation-1",
        document: sourceDocument,
        job: {
          failureMessage: null,
          id: "job-1",
          kind: "suggestions.apply",
          status: "running",
        },
        suggestions: [],
      }),
    );
    renderDialog();

    expect(await screen.findByText("Applying scaffold")).toBeVisible();
    expect(screen.queryByText("Finding useful scaffolds")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Applying scaffold. Updating the worksheet with your chosen scaffold.",
    );
  });

  it("ignores an apply response after the lesson changes", async () => {
    const pending = deferred<WorksheetScaffoldingState>();
    const nextDocument = {
      ...sourceDocument,
      id: "oak:worksheet:multiplying-fractions:pupil",
      metadata: { title: "Multiplying fractions worksheet" },
    };
    openWorksheetScaffoldingMock
      .mockResolvedValueOnce(opened(readyWithSuggestion))
      .mockResolvedValueOnce(
        opened({
          adaptationId: "adaptation-2",
          document: nextDocument,
          job: null,
          suggestions: [],
        }),
      );
    applySuggestionMock.mockReturnValueOnce(pending.promise);
    const { rerender } = renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a word bank" }),
    );
    rerender({
      lesson: {
        ...lesson,
        lessonSlug: "multiplying-fractions",
        title: "Multiplying fractions",
      },
    });
    expect(
      await screen.findByRole("article", { name: "Multiplying fractions worksheet" }),
    ).toBeVisible();

    pending.resolve(readyWithSuggestion);
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: "Multiplying fractions worksheet" }),
      ).toBeVisible(),
    );
  });

  it("ignores a resume response after the lesson changes", async () => {
    const pending = deferred<WorksheetScaffoldingState>();
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    getWorksheetScaffoldingMock.mockReturnValueOnce(pending.promise);
    const { rerender } = renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Carry on" }));
    rerender({
      lesson: {
        ...lesson,
        lessonSlug: "multiplying-fractions",
        title: "Multiplying fractions",
      },
    });
    await waitFor(() => expect(openWorksheetScaffoldingMock).toHaveBeenCalledTimes(2));

    pending.resolve(readyWithSuggestion);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add a word bank" })).toBeNull(),
    );
  });

  it("shows suggestion generation as a distinct live loading status", async () => {
    const pending = deferred<WorksheetScaffoldingState>();
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        adaptationId: "adaptation-1",
        document: sourceDocument,
        job: {
          failureMessage: null,
          id: "job-1",
          kind: "suggestions.generate",
          status: "running",
        },
        suggestions: [],
      }),
    );
    getWorksheetScaffoldingMock.mockReturnValue(pending.promise);
    renderDialog();

    expect(await screen.findByText("Finding useful scaffolds")).toBeVisible();
    expect(
      screen.getByText("Reviewing the worksheet for useful scaffolds."),
    ).toBeVisible();
    expect(screen.getByTestId("worksheet-scaffolding-loading-spinner")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finding useful scaffolds. Reviewing the worksheet for useful scaffolds.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Review the worksheet and choose any scaffolds"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start again" }),
    ).not.toBeInTheDocument();

    pending.resolve({
      adaptationId: "adaptation-1",
      document: sourceDocument,
      job: null,
      suggestions: [],
    });
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
  });

  it("keeps the worksheet visible while finding subsequent suggestions", async () => {
    const polledDocument = {
      ...sourceDocument,
      metadata: { title: "Polled adding fractions worksheet" },
    };
    const generating = {
      adaptationId: "adaptation-1",
      document: sourceDocument,
      job: {
        failureMessage: null,
        id: "job-2",
        kind: "suggestions.generate",
        status: "running",
      },
      suggestions: [],
    } as const;
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    applySuggestionMock.mockResolvedValueOnce(generating);
    getWorksheetScaffoldingMock.mockResolvedValueOnce({
      ...generating,
      document: polledDocument,
    });
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a word bank" }),
    );

    expect(await screen.findByText("Finding useful scaffolds")).toBeVisible();
    await waitFor(() => expect(getWorksheetScaffoldingMock).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("article", {
        name: "Polled adding fractions worksheet",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Start again" })).toBeVisible();
  });

  it("politely explains when a successful run finds no useful scaffolds", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        adaptationId: "adaptation-1",
        document: sourceDocument,
        job: {
          failureMessage: null,
          id: "job-1",
          kind: "suggestions.generate",
          status: "succeeded",
        },
        suggestions: [],
      }),
    );
    renderDialog();

    expect(await screen.findByText("No scaffolds suggested")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "It may already give pupils the support they need.",
    );
  });

  it("shows a helpful error banner when scaffold generation fails", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        adaptationId: "adaptation-1",
        document: sourceDocument,
        job: {
          failureMessage: "The background job failed while executing.",
          id: "job-1",
          kind: "suggestions.generate",
          status: "failed",
        },
        suggestions: [],
      }),
    );
    renderDialog();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't find scaffolds");
    expect(alert).not.toHaveTextContent("background job");
    expect(
      screen.getByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    await userEvent.click(within(alert).getByRole("button", { name: "Start again" }));
    expect(openWorksheetScaffoldingMock).toHaveBeenCalledTimes(2);
  });

  it("reports a document failure and lets the teacher retry", async () => {
    const error = new Error("source unavailable");
    const onError = vi.fn();
    openWorksheetScaffoldingMock.mockRejectedValueOnce(error);
    renderDialog({ onError });

    const fallback = await screen.findByTestId(
      "resource-adapter-worksheet-scaffolding-error",
    );
    expect(fallback).toHaveAttribute("role", "alert");
    expect(onError).toHaveBeenCalledWith(error, { componentStack: null });

    await userEvent.click(within(fallback).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(openWorksheetScaffoldingMock).toHaveBeenCalledTimes(2);
  });

  it("does not load a document while closed and loads it on opening", async () => {
    const { rerender } = renderDialog({ isOpen: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(openWorksheetScaffoldingMock).not.toHaveBeenCalled();

    rerender({ isOpen: true });
    await waitFor(() => expect(openWorksheetScaffoldingMock).toHaveBeenCalledOnce());
  });

  it("does not reload when the host rebuilds the lesson and token props", async () => {
    const { rerender } = renderDialog();

    await waitFor(() => expect(openWorksheetScaffoldingMock).toHaveBeenCalledOnce());
    rerender({ lesson: { ...lesson }, getToken: async () => "clerk-token" });

    await expect(
      screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).resolves.toBeVisible();
    expect(openWorksheetScaffoldingMock).toHaveBeenCalledOnce();
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

    await userEvent.click(screen.getByRole("button", { name: "Close Modal" }));

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
