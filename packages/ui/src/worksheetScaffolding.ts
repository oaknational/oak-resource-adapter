import { TRPCClientError } from "@trpc/client";
import type {
  WorksheetScaffoldingApplyRequest,
  WorksheetScaffoldingReviewRequest,
  WorksheetScaffoldingRetryRequest,
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingRemoveRequest,
  WorksheetScaffoldingState,
  WorksheetScaffoldingDismissRequest,
} from "@oaknational/resource-adapter-contracts/internal";

import type { GetToken, LessonContext } from "./publicTypes.js";
import { createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";

type ClientOptions = Readonly<{
  apiBaseUrl: string;
  getToken: GetToken;
}>;

function apiError(message: string, error: unknown): ResourceAdapterApiError {
  return new ResourceAdapterApiError(
    message,
    error instanceof TRPCClientError ? error.data?.httpStatus : undefined,
  );
}

async function callApi<T>(message: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw apiError(message, error);
  }
}

export function openWorksheetScaffolding(
  options: ClientOptions &
    Readonly<{
      lesson: LessonContext;
      replacing?: { adaptationId: string; requestId: string } | undefined;
    }>,
): Promise<WorksheetScaffoldingEntry> {
  return callApi("Resource Adapter could not open worksheet scaffolding.", () =>
    createResourceAdapterInternalClient(options).worksheetScaffolding.open.mutate({
      lesson: options.lesson,
      ...(options.replacing === undefined ? {} : { replacing: options.replacing }),
    }),
  );
}

export function getWorksheetScaffolding(
  options: ClientOptions & Readonly<{ adaptationId: string }>,
): Promise<WorksheetScaffoldingState> {
  return callApi("Resource Adapter could not refresh worksheet scaffolding.", () =>
    createResourceAdapterInternalClient(options).worksheetScaffolding.get.query({
      adaptationId: options.adaptationId,
    }),
  );
}

export function applyWorksheetScaffoldingSuggestion(
  options: ClientOptions & WorksheetScaffoldingApplyRequest,
): Promise<WorksheetScaffoldingState> {
  return callApi("Resource Adapter could not apply that suggestion.", () =>
    createResourceAdapterInternalClient(
      options,
    ).worksheetScaffolding.applySuggestion.mutate({
      adaptationId: options.adaptationId,
      ...(options.params === undefined ? {} : { params: options.params }),
      suggestionId: options.suggestionId,
    }),
  );
}

async function reviewAction(
  action: "accept" | "undo",
  options: ClientOptions & WorksheetScaffoldingReviewRequest,
): Promise<WorksheetScaffoldingState> {
  return callApi(`Resource Adapter could not ${action} that scaffold.`, async () => {
    const client = createResourceAdapterInternalClient(options);
    return client.worksheetScaffolding[action].mutate({
      adaptationId: options.adaptationId,
      attemptId: options.attemptId,
    });
  });
}

export function acceptWorksheetScaffoldingReview(
  options: ClientOptions & WorksheetScaffoldingReviewRequest,
): Promise<WorksheetScaffoldingState> {
  return reviewAction("accept", options);
}

export function retryWorksheetScaffoldingReview(
  options: ClientOptions & WorksheetScaffoldingRetryRequest,
): Promise<WorksheetScaffoldingState> {
  return callApi("Resource Adapter could not retry that scaffold.", () =>
    createResourceAdapterInternalClient(options).worksheetScaffolding.retry.mutate({
      adaptationId: options.adaptationId,
      attemptId: options.attemptId,
      requestId: options.requestId,
    }),
  );
}

export function undoWorksheetScaffoldingReview(
  options: ClientOptions & WorksheetScaffoldingReviewRequest,
): Promise<WorksheetScaffoldingState> {
  return reviewAction("undo", options);
}

export function enqueueWorksheetScaffoldingRemoval(
  options: ClientOptions & WorksheetScaffoldingRemoveRequest,
): Promise<WorksheetScaffoldingState> {
  return callApi("Resource Adapter could not remove that scaffold.", () =>
    createResourceAdapterInternalClient(options).worksheetScaffolding.remove.mutate({
      adaptationId: options.adaptationId,
      contributionId: options.contributionId,
    }),
  );
}

export function enqueueWorksheetScaffoldingDismissal(
  options: ClientOptions & WorksheetScaffoldingDismissRequest,
): Promise<WorksheetScaffoldingState> {
  return callApi("Resource Adapter could not dismiss scaffolds here.", () =>
    createResourceAdapterInternalClient(options).worksheetScaffolding.dismiss.mutate({
      adaptationId: options.adaptationId,
      targetBlockId: options.targetBlockId,
    }),
  );
}
