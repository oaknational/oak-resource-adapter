import { TRPCClientError } from "@trpc/client";
import type {
  WorksheetScaffoldingApplyRequest,
  WorksheetScaffoldingEntry,
  WorksheetScaffoldingState,
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

export async function openWorksheetScaffolding(
  options: ClientOptions &
    Readonly<{ lesson: LessonContext; replacing?: string | undefined }>,
): Promise<WorksheetScaffoldingEntry> {
  try {
    return await createResourceAdapterInternalClient(
      options,
    ).worksheetScaffolding.open.mutate({
      lesson: options.lesson,
      ...(options.replacing === undefined ? {} : { replacing: options.replacing }),
    });
  } catch (error) {
    throw apiError("Resource Adapter could not open worksheet scaffolding.", error);
  }
}

export async function getWorksheetScaffolding(
  options: ClientOptions & Readonly<{ adaptationId: string }>,
): Promise<WorksheetScaffoldingState> {
  try {
    return await createResourceAdapterInternalClient(
      options,
    ).worksheetScaffolding.get.query({ adaptationId: options.adaptationId });
  } catch (error) {
    throw apiError("Resource Adapter could not refresh worksheet scaffolding.", error);
  }
}

export async function applyWorksheetScaffoldingSuggestion(
  options: ClientOptions & WorksheetScaffoldingApplyRequest,
): Promise<WorksheetScaffoldingState> {
  try {
    return await createResourceAdapterInternalClient(
      options,
    ).worksheetScaffolding.applySuggestion.mutate({
      adaptationId: options.adaptationId,
      ...(options.params === undefined ? {} : { params: options.params }),
      suggestionId: options.suggestionId,
    });
  } catch (error) {
    throw apiError("Resource Adapter could not apply that suggestion.", error);
  }
}
