import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import { clerkClient } from "@clerk/nextjs/server";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { getAuthorizedParties } from "./cors";

const log = raLogger("auth");

/**
 * Application boundary for Clerk verification: verifies the request's bearer
 * token and maps its claims to this minimal service identity.
 */
export type RequestAuthenticator = (
  request: Request,
) => Promise<ResourceAdapterAuthenticatedTeacher | null>;

export const requestAuthenticator: RequestAuthenticator = async (request) => {
  try {
    const client = await clerkClient();

    const requestState = await client.authenticateRequest(request, {
      authorizedParties: getAuthorizedParties(request),
    });
    if (!requestState.isAuthenticated) {
      return null;
    }

    const auth = requestState.toAuth();
    if (!auth.userId) {
      return null;
    }

    return {
      teacherId: auth.userId,
      organisationId: auth.orgId ?? null,
    };
  } catch (error: unknown) {
    log.error(error, {
      report: true,
    });
    return null;
  }
};
