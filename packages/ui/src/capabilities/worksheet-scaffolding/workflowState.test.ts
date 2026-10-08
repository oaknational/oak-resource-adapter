import { describe, expect, it } from "vitest";
import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";

import {
  workflowReducer,
  worksheetWasRefreshed,
  type ReadyWorkflow,
  type WorkflowEvent,
  type WorkflowState,
} from "./workflowState.js";

type Job = NonNullable<WorksheetScaffoldingState["job"]>;

const suggestion = {
  id: "suggestion-1",
  kind: "scaffold-add-word-bank",
  label: "Add a word bank",
  params: { supportLevel: "low" },
  reason: "This question depends on recalling several topic words.",
  targetBlockId: "question-1",
} as const;

function job(kind: Job["kind"], status: Job["status"]): Job {
  return { failureMessage: null, id: `${kind}-job`, kind, status };
}

function value(overrides: Partial<WorksheetScaffoldingState> = {}) {
  return {
    adaptationId: "adaptation-1",
    modelWorkBlocked: null,
    resourceDocumentId: "document-1",
    downloadAvailability: "original",
    document: {} as WorksheetScaffoldingState["document"],
    job: null,
    pendingReview: null,
    suggestions: [suggestion],
    ...overrides,
  } satisfies WorksheetScaffoldingState;
}

function run(...events: WorkflowEvent[]): ReadyWorkflow {
  const state = events.reduce<WorkflowState>(workflowReducer, { status: "idle" });
  if (state.status !== "ready") throw new Error(`Expected ready, got ${state.status}`);
  return state;
}

const opened = (state: WorksheetScaffoldingState): WorkflowEvent => ({
  type: "opened",
  entry: { outcome: "opened", state },
});
const received = (state: WorksheetScaffoldingState): WorkflowEvent => ({
  type: "received",
  value: state,
});

describe("workflowReducer", () => {
  it("keeps the applying marker and its listed suggestions until the apply job finishes", () => {
    const applying = run(
      opened(value()),
      { type: "applyStarted", suggestion },
      received(value({ job: job("suggestions.apply", "running"), suggestions: [] })),
    );
    expect(applying.applyingSuggestion).toEqual({
      id: suggestion.id,
      listedSuggestions: [suggestion],
      targetBlockId: suggestion.targetBlockId,
    });

    const finished = workflowReducer(
      applying,
      received(value({ job: job("suggestions.apply", "succeeded"), suggestions: [] })),
    );
    expect(finished).toMatchObject({ applyingSuggestion: null });
  });

  it("keeps an action pending only while it is changing the document", () => {
    const started = run(opened(value()), { type: "actionStarted" });

    expect(
      workflowReducer(
        started,
        received(value({ job: job("transformations.remove", "queued") })),
      ),
    ).toMatchObject({ actionIsPending: true });
    expect(
      workflowReducer(
        started,
        received(value({ job: job("suggestions.generate", "queued") })),
      ),
    ).toMatchObject({ actionIsPending: false });
  });

  it("hides the worksheet only while its first suggestions are generated", () => {
    const generating = value({ job: job("suggestions.generate", "running") });

    expect(run(opened(generating)).documentIsVisible).toBe(false);
    expect(
      run(
        opened(generating),
        received(value({ job: job("suggestions.generate", "succeeded") })),
      ).documentIsVisible,
    ).toBe(true);
    expect(run(opened(value()), received(generating)).documentIsVisible).toBe(true);
  });

  it("shows resumed work while its suggestions are still generated", () => {
    expect(
      run(
        { type: "loading" },
        {
          type: "resumed",
          value: value({ job: job("suggestions.generate", "running") }),
        },
      ).documentIsVisible,
    ).toBe(true);
  });

  it("forgets local progress when the workflow leaves the ready state", () => {
    expect(
      run(
        opened(value()),
        { type: "applyStarted", suggestion },
        { type: "failed" },
        opened(value({ job: job("suggestions.apply", "running") })),
      ).applyingSuggestion,
    ).toBeNull();
  });

  it("reports a refresh until the document changes or the teacher acts", () => {
    const refreshed = [opened(value()), { type: "refreshed", value: value() } as const];

    expect(worksheetWasRefreshed(run(...refreshed))).toBe(true);
    expect(worksheetWasRefreshed(run(...refreshed, received(value())))).toBe(true);
    expect(
      worksheetWasRefreshed(
        run(...refreshed, received(value({ resourceDocumentId: "document-2" }))),
      ),
    ).toBe(false);
    expect(worksheetWasRefreshed(run(...refreshed, { type: "actionStarted" }))).toBe(
      false,
    );
  });
});
