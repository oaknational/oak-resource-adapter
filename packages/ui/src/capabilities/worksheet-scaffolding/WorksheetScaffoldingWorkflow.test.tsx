// @vitest-environment jsdom
import { type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { OakThemeProvider, oakDefaultTheme } from "@oaknational/oak-components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "@testing-library/user-event";
import type { ResourceDocument } from "@oaknational/resource-document";

import { ResourceAdapterDialog } from "../../ResourceAdapterDialog.js";
import type { ResourceAdapterDialogProps } from "../../ResourceAdapterDialog.js";
import {
  acceptWorksheetScaffoldingReview,
  applyWorksheetScaffoldingSuggestion,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
  enqueueWorksheetScaffoldingRemoval,
  retryWorksheetScaffoldingReview,
  enqueueWorksheetScaffoldingDismissal,
  undoWorksheetScaffoldingReview,
} from "../../worksheetScaffolding.js";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";
import type { LessonContext, ResourceAdapterCapability } from "../../publicTypes.js";

vi.mock("../../worksheetScaffolding.js", () => ({
  acceptWorksheetScaffoldingReview: vi.fn(),
  applyWorksheetScaffoldingSuggestion: vi.fn(),
  getWorksheetScaffolding: vi.fn(),
  openWorksheetScaffolding: vi.fn(),
  enqueueWorksheetScaffoldingRemoval: vi.fn(),
  retryWorksheetScaffoldingReview: vi.fn(),
  enqueueWorksheetScaffoldingDismissal: vi.fn(),
  undoWorksheetScaffoldingReview: vi.fn(),
}));

const openWorksheetScaffoldingMock = vi.mocked(openWorksheetScaffolding);
const removeContributionMock = vi.mocked(enqueueWorksheetScaffoldingRemoval);
const getWorksheetScaffoldingMock = vi.mocked(getWorksheetScaffolding);
const applySuggestionMock = vi.mocked(applyWorksheetScaffoldingSuggestion);
const acceptReviewMock = vi.mocked(acceptWorksheetScaffoldingReview);
const retryReviewMock = vi.mocked(retryWorksheetScaffoldingReview);
const dismissTargetMock = vi.mocked(enqueueWorksheetScaffoldingDismissal);
const undoReviewMock = vi.mocked(undoWorksheetScaffoldingReview);
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
  label: "Add extra scaffolding",
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

function readyState(
  overrides: Partial<WorksheetScaffoldingState> = {},
): WorksheetScaffoldingState {
  return {
    adaptationId: "adaptation-1",
    document: sourceDocument,
    job: null,
    pendingReview: null,
    suggestions: [],
    ...overrides,
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

const wordBankSuggestion = {
  id: "suggestion-1",
  kind: "scaffold-add-word-bank",
  label: "Add a word bank",
  params: { supportLevel: "low" },
  reason: "This question depends on recalling several topic words.",
  targetBlockId: "question-1",
} as const;

const generatedJob = {
  failureMessage: null,
  id: "job-1",
  kind: "suggestions.generate",
  status: "succeeded",
} as const;

const readyWithSuggestion = readyState({
  job: generatedJob,
  suggestions: [wordBankSuggestion],
});

const readyWithGroupedSuggestions = readyState({
  job: generatedJob,
  suggestions: [
    wordBankSuggestion,
    {
      id: "suggestion-2",
      kind: "scaffold-add-recall-questions",
      label: "Add recall questions",
      params: { supportLevel: "medium" },
      reason: "A short recall prompt would help pupils retrieve prior knowledge.",
      targetBlockId: "question-1",
    },
  ],
});

const documentWithPendingScaffold: ResourceDocument = {
  ...sourceDocument,
  content: sourceDocument.content.map((node) =>
    node.id === "question-1" && node.type === "question"
      ? {
          ...node,
          children: [
            ...node.children,
            {
              id: "word-bank-1",
              type: "definitionList" as const,
              lead: [{ type: "text" as const, text: "Word bank" }],
              entries: [
                {
                  term: [{ type: "text" as const, text: "denominator" }],
                  definition: [
                    { type: "text" as const, text: "The number below the line." },
                  ],
                },
              ],
              extensions: { "oak:contribution": "contribution-1" },
            },
          ],
        }
      : node,
  ),
};

const readyWithPendingReview = readyState({
  document: documentWithPendingScaffold,
  pendingReview: {
    attemptId: "attempt-1",
    contributionId: "contribution-1",
    label: "Add a word bank",
    reason: "This question depends on recalling several topic words.",
    targetBlockId: "question-1",
  },
});

const readyWithAcceptedScaffold = readyState({
  document: documentWithPendingScaffold,
});

const documentWithTwoScaffolds: ResourceDocument = {
  ...documentWithPendingScaffold,
  content: [
    ...documentWithPendingScaffold.content,
    {
      content: [{ type: "text", text: "Earlier support" }],
      extensions: { "oak:contribution": "contribution-0" },
      id: "earlier-support",
      type: "paragraph",
    },
  ],
};

const readyWithPendingReviewBesideAccepted = readyState({
  document: documentWithTwoScaffolds,
  pendingReview: readyWithPendingReview.pendingReview,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  openWorksheetScaffoldingMock.mockResolvedValue(opened(readyState()));
  applySuggestionMock.mockResolvedValue(
    readyState({
      job: {
        failureMessage: null,
        id: "job-1",
        kind: "suggestions.apply",
        status: "queued",
      },
    }),
  );
  getWorksheetScaffoldingMock.mockResolvedValue(readyState());
  acceptReviewMock.mockResolvedValue({
    ...readyWithPendingReview,
    pendingReview: null,
  });
  retryReviewMock.mockResolvedValue({
    ...readyWithPendingReview,
    job: {
      failureMessage: null,
      id: "retry-job-1",
      kind: "transformations.retry",
      status: "queued",
    },
  });
  removeContributionMock.mockResolvedValue({
    ...readyWithAcceptedScaffold,
    job: {
      failureMessage: null,
      id: "remove-job-1",
      kind: "transformations.remove",
      status: "queued",
    },
  });
  dismissTargetMock.mockResolvedValue({
    ...readyWithSuggestion,
    job: {
      failureMessage: null,
      id: "dismiss-job-1",
      kind: "transformations.dismiss",
      status: "queued",
    },
    suggestions: [],
  });
  undoReviewMock.mockResolvedValue(readyWithSuggestion);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("WorksheetScaffoldingWorkflow", () => {
  it("loads and renders the capability source document", async () => {
    const { props } = renderDialog();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading worksheet. Getting your worksheet ready.",
    );
    const spinner = screen.getByTestId("worksheet-scaffolding-loading-spinner");
    expect(spinner).toBeVisible();
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

    const readyBanner = await screen.findByTestId("worksheet-scaffolding-status");
    expect(readyBanner).toBeVisible();
    expect(readyBanner).toHaveStyle({
      position: "sticky",
      top: "0px",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "There is one suggested scaffold for this worksheet.",
    );
    expect(
      screen.queryByText("This question depends on recalling several topic words."),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a word bank" }));

    expect(screen.getByTestId("worksheet-scaffolding-local-spinner")).toBeVisible();
    expect(screen.getByText("Working on it…")).toBeVisible();
    expect(screen.queryByText("Applying scaffold")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "There is one suggested scaffold for this worksheet.",
    );
    expect(applySuggestionMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      getToken: expect.any(Function),
      suggestionId: "suggestion-1",
    });
  });

  it("counts current suggestions separately from added scaffolds", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        ...readyWithPendingReview,
        suggestions: readyWithSuggestion.suggestions,
      }),
    );
    renderDialog();

    await screen.findByText("Added support");
    const statusBanner = screen.getByTestId("worksheet-scaffolding-status");
    expect(
      within(statusBanner).getByText(
        "There is one suggested scaffold for this worksheet. One scaffold has been added.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "There is one suggested scaffold for this worksheet. One scaffold has been added.",
    );
    expect(
      screen.queryByText(
        "Review the worksheet and choose any scaffolds that suit your class.",
      ),
    ).not.toBeInTheDocument();
  });

  it("groups suggestions that target the same document point", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(readyWithGroupedSuggestions),
    );
    renderDialog();

    const group = await screen.findByRole("group", { name: "Suggested scaffolds" });

    expect(within(group).getAllByRole("button")).toHaveLength(3);
    expect(
      within(group).getByRole("button", { name: "Add a word bank" }),
    ).toBeVisible();
    expect(
      within(group).getByRole("button", { name: "Add recall questions" }),
    ).toBeVisible();
    const rejection = within(group).getByRole("button", {
      name: "No scaffold required",
    });
    expect(rejection).toBeVisible();
    expect(within(group).getByRole("list")).toContainElement(rejection);

    await userEvent.click(
      within(group).getByRole("button", { name: "Add a word bank" }),
    );

    expect(
      within(group).queryByRole("button", { name: "Add a word bank" }),
    ).not.toBeInTheDocument();
    expect(within(group).getByText("Working on it…")).toBeVisible();
    expect(
      within(group).getByRole("button", { name: "Add recall questions" }),
    ).toBeDisabled();
  });

  it("can mark a suggestion target as not requiring a scaffold", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "No scaffold required" }),
    );

    expect(dismissTargetMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      getToken: expect.any(Function),
      targetBlockId: "question-1",
    });
  });

  it("shows application progress at the document insertion point", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(
        readyState({
          job: generatedJob,
          suggestions: [{ ...wordBankSuggestion, targetBlockId: null }],
        }),
      ),
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

    expect(within(group).getByText("Working on it…")).toBeVisible();
  });

  it("can remove all scaffolds from the action in the status banner", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    const worksheet = await screen.findByRole("article", {
      name: "Adding fractions worksheet",
    });
    const removeAll = screen.getByRole("button", { name: "Remove all scaffolds" });
    expect(removeAll.compareDocumentPosition(worksheet)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    await userEvent.click(removeAll);

    await waitFor(() =>
      expect(openWorksheetScaffoldingMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          replacing: {
            adaptationId: "adaptation-1",
            requestId: expect.any(String),
          },
        }),
      ),
    );
  });

  it("offers unfinished work back instead of opening the worksheet", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        pendingScaffoldCount: 1,
        scaffoldCount: 2,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    renderDialog();

    expect(
      await screen.findByRole("heading", { name: "Carry on with this worksheet?" }),
    ).toBeVisible();
    expect(screen.getByText(/This worksheet has 2 scaffolds/)).toBeVisible();
    expect(screen.getByText(/One scaffold is waiting for your review/)).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("loads the saved adaptation when the teacher carries on", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        pendingScaffoldCount: 0,
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
        pendingScaffoldCount: 0,
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    getWorksheetScaffoldingMock.mockResolvedValue(
      readyState({
        adaptationId: "adaptation-9",
        job: {
          failureMessage: null,
          id: "job-2",
          kind: "suggestions.generate",
          status: "running",
        },
      }),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Carry on" }));

    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
    expect(
      screen.getByText("Considering scaffold selections for practice tasks"),
    ).toBeVisible();
  });

  it("replaces the declined adaptation when the teacher starts from the original", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce({
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        pendingScaffoldCount: 0,
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
        expect.objectContaining({
          replacing: {
            adaptationId: "adaptation-9",
            requestId: expect.any(String),
          },
        }),
      ),
    );
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
  });

  it("reuses the replacement request after a lost response", async () => {
    const error = new Error("response lost");
    openWorksheetScaffoldingMock
      .mockResolvedValueOnce({
        outcome: "resumable",
        resumable: {
          adaptationId: "adaptation-9",
          pendingScaffoldCount: 0,
          scaffoldCount: 1,
          updatedAt: "2026-02-03T09:00:00.000Z",
        },
      })
      .mockRejectedValueOnce(error);
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Start from the original" }),
    );
    const fallback = await screen.findByTestId(
      "resource-adapter-worksheet-scaffolding-error",
    );
    const firstReplacement = openWorksheetScaffoldingMock.mock.calls[1]?.[0].replacing;
    await userEvent.click(within(fallback).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(openWorksheetScaffoldingMock).toHaveBeenCalledTimes(3));
    expect(openWorksheetScaffoldingMock.mock.calls[2]?.[0].replacing).toEqual(
      firstReplacement,
    );
  });

  it("replaces the failed adaptation when the teacher restarts", async () => {
    const resumable = {
      outcome: "resumable",
      resumable: {
        adaptationId: "adaptation-9",
        pendingScaffoldCount: 0,
        scaffoldCount: 1,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    } as const;
    const failed = opened(
      readyState({
        adaptationId: "adaptation-10",
        job: {
          failureMessage: null,
          id: "job-1",
          kind: "suggestions.generate",
          status: "failed",
        },
      }),
    );
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
      expect.objectContaining({
        replacing: {
          adaptationId: "adaptation-10",
          requestId: expect.any(String),
        },
      }),
    );
  });

  it("keeps the rationale collapsed until the teacher asks for it", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    expect(await screen.findByText("Added support")).toBeVisible();
    const disclosure = screen.getByRole("button", {
      name: "How this can support your pupils",
    });
    const reason = screen.getByText(
      "This question depends on recalling several topic words.",
    );
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(reason).not.toBeVisible();

    await userEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(reason).toBeVisible();
  });

  it("offers undo, retry and accept on the pending scaffold", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    await screen.findByText("Added support");

    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Accept" })).toBeVisible();
  });

  it("accepts the pending scaffold", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    expect(acceptReviewMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      attemptId: "attempt-1",
      getToken: expect.any(Function),
    });
  });

  it("asks for another version of the pending scaffold and reports the run", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(retryReviewMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      attemptId: "attempt-1",
      getToken: expect.any(Function),
      requestId: expect.any(String),
    });
    expect(await screen.findByText("Trying scaffold again")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Trying scaffold again. Creating another version of this scaffold.",
    );
  });

  it("keeps local review actions available after a retry fails", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened({
        ...readyWithPendingReview,
        job: {
          failureMessage: "The retry failed.",
          id: "retry-job-1",
          kind: "transformations.retry",
          status: "failed",
        },
      }),
    );
    renderDialog();

    expect(
      await screen.findByText(
        "You can retry again, accept this version, undo it, or start again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("does not offer to remove other scaffolds while a review is pending", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(readyWithPendingReviewBesideAccepted),
    );
    renderDialog();

    await screen.findByRole("button", { name: "Accept" });

    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("restores the previous suggestions when the scaffold is undone", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithPendingReview));
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(undoReviewMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      attemptId: "attempt-1",
      getToken: expect.any(Function),
    });
    expect(
      await screen.findByRole("button", { name: "Add a word bank" }),
    ).toBeVisible();
    expect(screen.queryByText("Added support")).not.toBeInTheDocument();
  });

  it("removes an accepted scaffold through its contribution control", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(readyWithAcceptedScaffold),
    );
    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));

    expect(removeContributionMock).toHaveBeenCalledWith({
      adaptationId: "adaptation-1",
      apiBaseUrl,
      contributionId: "contribution-1",
      getToken: expect.any(Function),
    });
    expect(await screen.findByText("Removing scaffold")).toBeVisible();
  });

  it("moves focus to local progress when the chosen suggestion disappears", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(opened(readyWithSuggestion));
    renderDialog();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add a word bank" }),
    );

    const marker = await screen.findByText("Working on it…");
    const focusTarget = marker.closest("[tabindex]");
    expect(focusTarget).not.toBeNull();
    expect(focusTarget).toHaveFocus();
  });

  it("announces a background application job that has no local progress marker", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(
        readyState({
          job: {
            failureMessage: null,
            id: "job-1",
            kind: "suggestions.apply",
            status: "running",
          },
        }),
      ),
    );
    renderDialog();

    await screen.findByRole("article", { name: "Adding fractions worksheet" });
    expect(screen.getByText("Applying scaffold")).toBeVisible();
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
        opened(readyState({ adaptationId: "adaptation-2", document: nextDocument })),
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
        pendingScaffoldCount: 0,
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
      opened(
        readyState({
          job: {
            failureMessage: null,
            id: "job-1",
            kind: "suggestions.generate",
            status: "running",
          },
        }),
      ),
    );
    getWorksheetScaffoldingMock.mockReturnValue(pending.promise);
    renderDialog();

    expect(
      await screen.findByText("Considering scaffold selections for practice tasks"),
    ).toBeVisible();
    expect(
      screen.getByText("Reviewing the worksheet for useful scaffolds."),
    ).toBeVisible();
    const spinner = screen.getByTestId("worksheet-scaffolding-loading-spinner");
    expect(spinner).toBeVisible();
    expect(spinner).toHaveStyle({ borderTopStyle: "solid" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Considering scaffold selections for practice tasks. Reviewing the worksheet for useful scaffolds.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Review the worksheet and choose any scaffolds"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start again" }),
    ).not.toBeInTheDocument();

    pending.resolve(readyState());
    expect(
      await screen.findByRole("article", { name: "Adding fractions worksheet" }),
    ).toBeVisible();
  });

  it("keeps the worksheet visible while finding subsequent suggestions", async () => {
    const polledDocument = {
      ...sourceDocument,
      metadata: { title: "Polled adding fractions worksheet" },
    };
    const generating = readyState({
      job: {
        failureMessage: null,
        id: "job-2",
        kind: "suggestions.generate",
        status: "running",
      },
    });
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

    expect(
      await screen.findByText("Considering scaffold selections for practice tasks"),
    ).toBeVisible();
    await waitFor(() => expect(getWorksheetScaffoldingMock).toHaveBeenCalledOnce());
    expect(
      await screen.findByRole("article", {
        name: "Polled adding fractions worksheet",
      }),
    ).toBeVisible();
  });

  it("politely explains when a successful run finds no useful scaffolds", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(
        readyState({
          job: {
            failureMessage: null,
            id: "job-1",
            kind: "suggestions.generate",
            status: "succeeded",
          },
        }),
      ),
    );
    renderDialog();

    expect(await screen.findByText("No scaffolds suggested")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "It may already give pupils the support they need.",
    );
  });

  it("shows a helpful error banner when scaffold generation fails", async () => {
    openWorksheetScaffoldingMock.mockResolvedValueOnce(
      opened(
        readyState({
          job: {
            failureMessage: "The background job failed while executing.",
            id: "job-1",
            kind: "suggestions.generate",
            status: "failed",
          },
        }),
      ),
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
});
