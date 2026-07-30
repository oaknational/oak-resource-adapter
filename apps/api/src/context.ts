import {
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type {
  FeatureFlagServiceType,
  ResourceAdapterApiContext,
} from "@oaknational/resource-adapter-contracts/server";

import { requestAuthenticator, type RequestAuthenticator } from "./authentication";
import * as capabilities from "./capabilities";
import { FeatureFlagService } from "./feature-flags/service";
import type { FeatureFlagKey } from "./feature-flags/catalogue";

/** Creates request-scoped API dependencies for tRPC procedures. */
export async function createContext(
  request: Request,
  authenticateRequest: RequestAuthenticator = requestAuthenticator,
  featureFlagService: FeatureFlagServiceType<FeatureFlagKey> = FeatureFlagService,
): Promise<ResourceAdapterApiContext> {
  const authenticatedTeacher = await authenticateRequest(request);

  return {
    apiContractVersion: parseResourceAdapterApiContractVersion(
      request.headers.get(resourceAdapterApiContractVersionHeader),
    ),
    authenticatedTeacher,
    capabilities: capabilities.buildCapabilitiesService(
      featureFlagService,
      authenticatedTeacher,
      capabilities.getCapabilities,
    ),
  };
}
