import {
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterApiContextHost } from "@oaknational/resource-adapter-contracts/server";
import type { ResourceAdapterApiContextInternal } from "@oaknational/resource-adapter-contracts/server";

import { requestAuthenticator, type RequestAuthenticator } from "./authentication";
import { getCapabilities } from "./capabilities";
import { FeatureFlagService } from "./feature-flags/service";

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
    featureFlags: FeatureFlagService,
  };
}
