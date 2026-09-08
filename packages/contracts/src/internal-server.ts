import { initTRPC, TRPCError } from "@trpc/server";
import { resourceDocumentSchema } from "@oaknational/resource-document/schema";
import type { ResourceDocument } from "@oaknational/resource-document";
import { z } from "zod";

import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  resourceAdapterSourceDocumentRequestSchema,
  worksheetScaffoldingApplyRequestSchema,
  worksheetScaffoldingReviewRequestSchema,
  worksheetScaffoldingRetryRequestSchema,
  worksheetScaffoldingGetRequestSchema,
  worksheetScaffoldingJobKinds,
  worksheetScaffoldingOpenRequestSchema,
  worksheetScaffoldingRemoveRequestSchema,
  worksheetScaffoldingDismissRequestSchema,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingReviewRequest,
  type WorksheetScaffoldingRetryRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingGetRequest,
  type WorksheetScaffoldingOpenRequest,
  type WorksheetScaffoldingRemoveRequest,
  type WorksheetScaffoldingState,
  type WorksheetScaffoldingDismissRequest,
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
  accept: (
    request: WorksheetScaffoldingReviewRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
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
  remove: (
    request: WorksheetScaffoldingRemoveRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  retry: (
    request: WorksheetScaffoldingRetryRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  dismiss: (
    request: WorksheetScaffoldingDismissRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  undo: (
    request: WorksheetScaffoldingReviewRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
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
  pendingReview: z.nullable(
    z.object({
      attemptId: z.string(),
      contributionId: z.string(),
      label: z.string(),
      reason: z.string(),
      targetBlockId: z.nullable(z.string()),
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
      pendingScaffoldCount: z.number().check(z.int(), z.nonnegative()),
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
    accept: internalAuthenticatedProcedure
      .input(worksheetScaffoldingReviewRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.accept(input, ctx.authenticatedTeacher),
        ),
      ),
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
    remove: internalAuthenticatedProcedure
      .input(worksheetScaffoldingRemoveRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.remove(input, ctx.authenticatedTeacher),
        ),
      ),
    retry: internalAuthenticatedProcedure
      .input(worksheetScaffoldingRetryRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.retry(input, ctx.authenticatedTeacher),
        ),
      ),
    dismiss: internalAuthenticatedProcedure
      .input(worksheetScaffoldingDismissRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.dismiss(input, ctx.authenticatedTeacher),
        ),
      ),
    undo: internalAuthenticatedProcedure
      .input(worksheetScaffoldingReviewRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.undo(input, ctx.authenticatedTeacher),
        ),
      ),
  }),
});

export type InternalRouter = typeof internalRouter;
