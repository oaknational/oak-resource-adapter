import {
  documentChangingJobKinds,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingResumable,
  type WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

type WorksheetSuggestion = WorksheetScaffoldingState["suggestions"][number];

/**
 * `listedSuggestions` is the list as it stood when applying began. The applied
 * suggestion leaves `state` before its job finishes, so rendering from the live
 * list would drop the row the pupil-facing spinner belongs in.
 */
export type ApplyingSuggestion = Readonly<{
  id: WorksheetSuggestion["id"];
  listedSuggestions: WorksheetScaffoldingState["suggestions"];
  targetBlockId: WorksheetSuggestion["targetBlockId"];
}>;

export type ReadyWorkflow = Readonly<{
  status: "ready";
  value: WorksheetScaffoldingState;
  applyingSuggestion: ApplyingSuggestion | null;
  actionIsPending: boolean;
  documentIsVisible: boolean;
  refreshedResourceDocumentId: string | null;
}>;

export type WorkflowState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "choosing"; resumable: WorksheetScaffoldingResumable }>
  | ReadyWorkflow
  | Readonly<{ status: "error" }>;

export type WorkflowEvent =
  | Readonly<{ type: "closed" }>
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "failed" }>
  | Readonly<{ type: "opened"; entry: WorksheetScaffoldingEntry }>
  | Readonly<{ type: "resumed"; value: WorksheetScaffoldingState }>
  | Readonly<{ type: "received"; value: WorksheetScaffoldingState }>
  | Readonly<{ type: "refreshed"; value: WorksheetScaffoldingState }>
  | Readonly<{ type: "applyStarted"; suggestion: WorksheetSuggestion }>
  | Readonly<{ type: "actionStarted" }>
  | Readonly<{ type: "refusalExpired" }>;

export function jobIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.status === "queued" || state.job?.status === "running";
}

export function documentUpdateIsBusy(state: WorksheetScaffoldingState): boolean {
  return (
    state.job !== null &&
    jobIsBusy(state) &&
    documentChangingJobKinds.includes(state.job.kind)
  );
}

function suggestionGenerationIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.kind === "suggestions.generate" && jobIsBusy(state);
}

function suggestionApplicationIsBusy(state: WorksheetScaffoldingState): boolean {
  return state.job?.kind === "suggestions.apply" && jobIsBusy(state);
}

export function worksheetWasRefreshed(state: ReadyWorkflow): boolean {
  return state.refreshedResourceDocumentId === state.value.resourceDocumentId;
}

/**
 * Local progress markers outlive the response that started them: each clears
 * once the server reports its job finished. The worksheet stays hidden only
 * while the first suggestions are generated.
 */
function received(
  previous: WorkflowState,
  value: WorksheetScaffoldingState,
): ReadyWorkflow {
  const ready = previous.status === "ready" ? previous : null;
  return {
    status: "ready",
    value,
    applyingSuggestion: suggestionApplicationIsBusy(value)
      ? (ready?.applyingSuggestion ?? null)
      : null,
    actionIsPending: documentUpdateIsBusy(value) && (ready?.actionIsPending ?? false),
    documentIsVisible:
      (ready?.documentIsVisible ?? false) || !suggestionGenerationIsBusy(value),
    refreshedResourceDocumentId: ready?.refreshedResourceDocumentId ?? null,
  };
}

export function workflowReducer(
  state: WorkflowState,
  event: WorkflowEvent,
): WorkflowState {
  switch (event.type) {
    case "closed":
      return { status: "idle" };
    case "loading":
      return { status: "loading" };
    case "failed":
      return { status: "error" };
    case "opened":
      return event.entry.outcome === "resumable"
        ? { status: "choosing", resumable: event.entry.resumable }
        : received(state, event.entry.state);
    case "resumed":
      return { ...received(state, event.value), documentIsVisible: true };
    case "received":
      return received(state, event.value);
    case "refreshed":
      return {
        ...received(state, event.value),
        refreshedResourceDocumentId: event.value.resourceDocumentId,
      };
    case "applyStarted":
      return state.status === "ready"
        ? {
            ...state,
            applyingSuggestion: {
              id: event.suggestion.id,
              listedSuggestions: state.value.suggestions,
              targetBlockId: event.suggestion.targetBlockId,
            },
            refreshedResourceDocumentId: null,
          }
        : state;
    case "actionStarted":
      return state.status === "ready"
        ? { ...state, actionIsPending: true, refreshedResourceDocumentId: null }
        : state;
    case "refusalExpired":
      return state.status === "ready"
        ? { ...state, value: { ...state.value, modelWorkBlocked: null } }
        : state;
  }
}
