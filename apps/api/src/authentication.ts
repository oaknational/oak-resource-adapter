import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

/**
 * Application boundary for Clerk verification. The real implementation will
 * verify the bearer token and map its claims to this minimal service identity.
 */
export type RequestAuthenticator = (
  request: Request,
) => Promise<ResourceAdapterAuthenticatedTeacher | null>;

/**
 * Keeps the initial unauthenticated local skeleton explicit. Replacing this
 * with the Clerk-backed implementation is required before protected
 * procedures are enabled.
 */
export const unauthenticatedRequestAuthenticator: RequestAuthenticator = async () =>
  null;
