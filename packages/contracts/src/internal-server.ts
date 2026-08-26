import { initTRPC, TRPCError } from "@trpc/server";
import { resourceDocumentSchema } from "@oaknational/resource-document/schema";
import type { ResourceDocument } from "@oaknational/resource-document";

import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  resourceAdapterSourceDocumentRequestSchema,
  type ResourceAdapterSourceDocumentRequest,
  type ResourceAdapterFeatureFlagsResponse,
} from "./internal-contract.js";

/** The service boundary required by the feature flags procedure. */
export type ResourceAdapterFeatureFlagService = Readonly<{
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) =>
    Promise<ResourceAdapterFeatureFlagsResponse> | ResourceAdapterFeatureFlagsResponse;
}>;

export type ResourceAdapterSourceDocumentService = Readonly<{
  getSourceDocument: (
    request: ResourceAdapterSourceDocumentRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<ResourceDocument | null> | ResourceDocument | null;
}>;

/** Internal API context served from `/trpc/internal`. */
export type ResourceAdapterApiContextInternal = Readonly<{
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
  sourceDocuments: ResourceAdapterSourceDocumentService;
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
  sourceDocuments: t_internal.router({
    get: internalAuthenticatedProcedure
      .input(resourceAdapterSourceDocumentRequestSchema)
      .output(resourceDocumentSchema)
      .query(async ({ ctx, input }) => {
        const document = await ctx.sourceDocuments.getSourceDocument(
          input,
          ctx.authenticatedTeacher,
        );

        if (document === null) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "The selected capability has no source document for this lesson.",
          });
        }

        return document;
      }),
  }),
});

export type InternalRouter = typeof internalRouter;
