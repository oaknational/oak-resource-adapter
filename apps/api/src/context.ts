import {
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";

import { requestAuthenticator, type RequestAuthenticator } from "./authentication";
import { getCapabilities, hasCapabilities } from "./capabilities/service";
import { getFeatureFlagService } from "./feature-flags/service";
import { getSourceDocument } from "./source-documents/service";
import {
  acceptWorksheetScaffoldingReview,
  enqueueSuggestionApplication,
  enqueueWorksheetScaffoldingRetry,
  getWorksheetScaffoldingState,
  openWorksheetScaffolding,
  enqueueWorksheetScaffoldingRemoval,
  enqueueWorksheetScaffoldingDismissal,
  undoWorksheetScaffoldingReview,
} from "./worksheet-scaffolding/service";
import type { ResourceAdapterApiContextHost } from "@oaknational/resource-adapter-contracts/server";
import type { ResourceAdapterApiContextInternal } from "@oaknational/resource-adapter-contracts/internal/server";

/** Creates request-scoped dependencies for the public host API (`/trpc/v1`). */
export async function createContextHost(
  request: Request,
  authenticateRequest: RequestAuthenticator = requestAuthenticator,
): Promise<ResourceAdapterApiContextHost> {
  return {
    apiContractVersion: parseResourceAdapterApiContractVersion(
      request.headers.get(resourceAdapterApiContractVersionHeader),
    ),
    authenticatedTeacher: await authenticateRequest(request),
    capabilities: {
      getCapabilities,
      hasCapabilities,
    },
  };
}

/** Creates request-scoped dependencies for the internal API (`/trpc/internal`). */
export async function createContextInternal(
  request: Request,
  authenticateRequest: RequestAuthenticator = requestAuthenticator,
): Promise<ResourceAdapterApiContextInternal> {
  return {
    authenticatedTeacher: await authenticateRequest(request),
    featureFlags: getFeatureFlagService(),
    sourceDocuments: { getSourceDocument },
    worksheetScaffolding: {
      accept: (input, target) => acceptWorksheetScaffoldingReview(input, target),
      applySuggestion: (input, target) => enqueueSuggestionApplication(input, target),
      get: ({ adaptationId }, target) =>
        getWorksheetScaffoldingState(adaptationId, target),
      open: (request, target) => openWorksheetScaffolding(request, target),
      remove: (input, target) => enqueueWorksheetScaffoldingRemoval(input, target),
      retry: (input, target) => enqueueWorksheetScaffoldingRetry(input, target),
      dismiss: (input, target) => enqueueWorksheetScaffoldingDismissal(input, target),
      undo: (input, target) => undoWorksheetScaffoldingReview(input, target),
    },
  };
}
