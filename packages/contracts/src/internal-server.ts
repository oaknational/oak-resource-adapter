import { initTRPC, TRPCError } from "@trpc/server";
import { resourceDocumentSchema } from "@oaknational/resource-document/schema";
import type { ResourceDocument } from "@oaknational/resource-document";
import { z } from "zod";

import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  resourceAdapterSourceDocumentRequestSchema,
  worksheetScaffoldingApplyRequestSchema,
  worksheetScaffoldingGetRequestSchema,
  worksheetScaffoldingJobKinds,
  worksheetScaffoldingOpenRequestSchema,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingGetRequest,
  type WorksheetScaffoldingOpenRequest,
  type WorksheetScaffoldingState,
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

export type WorksheetScaffoldingService = Readonly<{
  applySuggestion: (
    request: WorksheetScaffoldingApplyRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  get: (
    request: WorksheetScaffoldingGetRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  open: (
    request: WorksheetScaffoldingOpenRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingEntry | null>;
}>;
/** Internal API context served from `/trpc/internal`. */
export type ResourceAdapterApiContextInternal = Readonly<{
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
  sourceDocuments: ResourceAdapterSourceDocumentService;
  worksheetScaffolding: WorksheetScaffoldingService;
}>;

const t_internal = initTRPC.context<ResourceAdapterApiContextInternal>().create();

const worksheetScaffoldingStateSchema = z.object({
  adaptationId: z.string(),
  document: resourceDocumentSchema,
  job: z.nullable(
    z.object({
      failureMessage: z.nullable(z.string()),
      id: z.string(),
      kind: z.enum(worksheetScaffoldingJobKinds),
      status: z.enum(["failed", "queued", "running", "succeeded"]),
    }),
  ),
  suggestions: z.readonly(
    z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        label: z.string(),
        params: z.record(z.string(), z.unknown()),
        reason: z.string(),
        targetBlockId: z.nullable(z.string()),
      }),
    ),
  ),
});

const worksheetScaffoldingEntrySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("opened"), state: worksheetScaffoldingStateSchema }),
  z.object({
    outcome: z.literal("resumable"),
    resumable: z.object({
      adaptationId: z.string(),
      scaffoldCount: z.number().check(z.int(), z.nonnegative()),
      updatedAt: z.string(),
    }),
  }),
]);

function requireWorksheetScaffolding<TValue>(value: TValue | null): TValue {
  if (value === null) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "The worksheet scaffolding adaptation was not found.",
    });
  }
  return value;
}

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
  worksheetScaffolding: t_internal.router({
    applySuggestion: internalAuthenticatedProcedure
      .input(worksheetScaffoldingApplyRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.applySuggestion(
            input,
            ctx.authenticatedTeacher,
          ),
        ),
      ),
    get: internalAuthenticatedProcedure
      .input(worksheetScaffoldingGetRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .query(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.get(input, ctx.authenticatedTeacher),
        ),
      ),
    open: internalAuthenticatedProcedure
      .input(worksheetScaffoldingOpenRequestSchema)
      .output(worksheetScaffoldingEntrySchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.open(input, ctx.authenticatedTeacher),
        ),
      ),
  }),
});

export type InternalRouter = typeof internalRouter;
