import {
  parseResourceAdapterApiContractVersion,
  resourceAdapterApiContractVersionHeader,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterApiContext } from "@oaknational/resource-adapter-contracts/server";

import {
  type RequestAuthenticator,
  unauthenticatedRequestAuthenticator,
} from "./authentication";
import { getCapabilities } from "./capabilities";

/** Creates request-scoped API dependencies for tRPC procedures. */
export async function createContext(
  request: Request,
  authenticateRequest: RequestAuthenticator = unauthenticatedRequestAuthenticator,
): Promise<ResourceAdapterApiContext> {
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
