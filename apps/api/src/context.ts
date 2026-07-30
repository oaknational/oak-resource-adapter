import {
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterApiContext } from "@oaknational/resource-adapter-contracts/server";

import { requestAuthenticator, type RequestAuthenticator } from "./authentication";
import * as capabilities from "./capabilities";
import {
  FeatureFlagService,
  type FeatureFlagServiceType,
} from "./feature-flags/service";

/** Creates request-scoped API dependencies for tRPC procedures. */
export async function createContext(
  request: Request,
  authenticateRequest: RequestAuthenticator = requestAuthenticator,
  featureFlagService: FeatureFlagServiceType = FeatureFlagService,
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
