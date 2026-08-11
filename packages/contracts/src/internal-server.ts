import { initTRPC, TRPCError } from "@trpc/server";

import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  type ResourceAdapterFeatureFlagsResponse,
} from "./internal-contract.js";

/** The service boundary required by the feature flags procedure. */
export type ResourceAdapterFeatureFlagService = Readonly<{
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) =>
    Promise<ResourceAdapterFeatureFlagsResponse> | ResourceAdapterFeatureFlagsResponse;
}>;

/** Internal API context served from `/trpc/internal`. */
export type ResourceAdapterApiContextInternal = Readonly<{
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
}>;

const t_internal = initTRPC.context<ResourceAdapterApiContextInternal>().create();

/** Use for every authenticated teacher-facing procedure on the internal API. */
export const internalAuthenticatedProcedure = t_internal.procedure.use(
  ({ ctx, next }) => {
    if (ctx.authenticatedTeacher === null) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      });
    }

    return next({
      ctx: {
        ...ctx,
        authenticatedTeacher: ctx.authenticatedTeacher,
      },
    });
  },
);

/** The unversioned internal API router served from `/trpc/internal`. */
export const internalRouter = t_internal.router({
  featureFlags: t_internal.router({
    get: internalAuthenticatedProcedure
      .output(resourceAdapterFeatureFlagsResponseSchema)
      .query(({ ctx }) => ctx.featureFlags.getEnabledFlags(ctx.authenticatedTeacher)),
  }),
});

export type InternalRouter = typeof internalRouter;
