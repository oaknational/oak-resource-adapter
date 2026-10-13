import { initTRPC, TRPCError } from "@trpc/server";
import { resourceDocumentSchema } from "@oaknational/resource-document/schema";
import { z } from "zod";

import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  supportLevels,
  transformationInputSchema,
  worksheetExportRequestSchema,
  worksheetDownloadAvailabilitySchema,
  type WorksheetExportRequest,
  type WorksheetExportResult,
  worksheetScaffoldingApplyRequestSchema,
  worksheetScaffoldingReviewRequestSchema,
  worksheetScaffoldingRetryTransformationRequestSchema,
  worksheetScaffoldingGetRequestSchema,
  worksheetScaffoldingJobKinds,
  worksheetScaffoldingOpenRequestSchema,
  worksheetScaffoldingRemoveRequestSchema,
  worksheetScaffoldingDismissRequestSchema,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingReviewRequest,
  type WorksheetScaffoldingRetryTransformationRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingGetRequest,
  type WorksheetScaffoldingOpenRequest,
  type WorksheetScaffoldingRemoveRequest,
  type WorksheetScaffoldingState,
  type WorksheetScaffoldingDismissRequest,
  type ResourceAdapterFeatureFlagsResponse,
  type TeacherAllowance,
  type WorksheetScaffoldingRetrySuggestionsRequest,
  worksheetScaffoldingRetrySuggestionsRequestSchema,
} from "./internal-contract.js";

/** The service boundary required by the feature flags procedure. */
export type ResourceAdapterFeatureFlagService = Readonly<{
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) =>
    Promise<ResourceAdapterFeatureFlagsResponse> | ResourceAdapterFeatureFlagsResponse;
}>;

export type TeacherAllowanceService = Readonly<{
  get: (target: ResourceAdapterAuthenticatedTeacher) => Promise<TeacherAllowance>;
}>;

export type WorksheetScaffoldingService = Readonly<{
  prepareExport: (
    request: WorksheetExportRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetExportResult | null>;
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
  retryTransformation: (
    request: WorksheetScaffoldingRetryTransformationRequest,
    target: ResourceAdapterAuthenticatedTeacher,
  ) => Promise<WorksheetScaffoldingState | null>;
  retrySuggestions: (
    request: WorksheetScaffoldingRetrySuggestionsRequest,
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
  allowance: TeacherAllowanceService;
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
  worksheetScaffolding: WorksheetScaffoldingService;
}>;

const t_internal = initTRPC.context<ResourceAdapterApiContextInternal>().create();

const teacherAllowanceSchema = z.discriminatedUnion("tier", [
  z.object({ tier: z.literal("full") }),
  z.object({
    tier: z.literal("limited"),
    limit: z.number().check(z.int(), z.positive()),
    remaining: z.number().check(z.int(), z.nonnegative()),
    resetsAt: z.iso.datetime(),
  }),
]) satisfies z.ZodType<TeacherAllowance>;

const worksheetScaffoldingStateSchema = z.object({
  adaptationId: z.string(),
  modelWorkBlocked: z.nullable(
    z.object({ kind: z.literal("model_jobs_24h"), retryAt: z.iso.datetime() }),
  ),
  resourceDocumentId: z.uuid(),
  downloadAvailability: worksheetDownloadAvailabilitySchema,
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
      kind: z.string(),
      label: z.string(),
      reason: z.string(),
      supportLevel: z.nullable(z.enum(supportLevels)),
      targetBlockId: z.nullable(z.string()),
    }),
  ),
  suggestions: z.readonly(
    z.array(
      z.object({
        id: z.string(),
        inputs: z.exactOptional(z.readonly(z.array(transformationInputSchema))),
        kind: z.string(),
        label: z.string(),
        params: z.record(z.string(), z.json()),
        reason: z.string(),
        targetBlockId: z.nullable(z.string()),
      }),
    ),
  ),
}) satisfies z.ZodType<WorksheetScaffoldingState>;

const worksheetScaffoldingEntrySchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("opened"), state: worksheetScaffoldingStateSchema }),
  z.object({ outcome: z.literal("reopened"), state: worksheetScaffoldingStateSchema }),
  z.object({
    outcome: z.literal("resumable"),
    resumable: z.object({
      adaptationId: z.string(),
      pendingScaffoldCount: z.number().check(z.int(), z.nonnegative()),
      scaffoldCount: z.number().check(z.int(), z.nonnegative()),
      updatedAt: z.string(),
    }),
  }),
  z.object({
    outcome: z.literal("usageLimitReached"),
    usageLimit: z.object({
      kind: z.literal("adapted_resources_month"),
      retryAt: z.iso.datetime(),
    }),
  }),
]) satisfies z.ZodType<WorksheetScaffoldingEntry>;

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
  allowance: t_internal.router({
    get: internalAuthenticatedProcedure
      .output(teacherAllowanceSchema)
      .query(({ ctx }) => ctx.allowance.get(ctx.authenticatedTeacher)),
  }),
  featureFlags: t_internal.router({
    get: internalAuthenticatedProcedure
      .output(resourceAdapterFeatureFlagsResponseSchema)
      .query(({ ctx }) => ctx.featureFlags.getEnabledFlags(ctx.authenticatedTeacher)),
  }),
  worksheetScaffolding: t_internal.router({
    prepareExport: internalAuthenticatedProcedure
      .input(worksheetExportRequestSchema)
      .output(z.object({ artifactId: z.uuid() }))
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.prepareExport(input, ctx.authenticatedTeacher),
        ),
      ),
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
    retryTransformation: internalAuthenticatedProcedure
      .input(worksheetScaffoldingRetryTransformationRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.retryTransformation(
            input,
            ctx.authenticatedTeacher,
          ),
        ),
      ),
    retrySuggestions: internalAuthenticatedProcedure
      .input(worksheetScaffoldingRetrySuggestionsRequestSchema)
      .output(worksheetScaffoldingStateSchema)
      .mutation(async ({ ctx, input }) =>
        requireWorksheetScaffolding(
          await ctx.worksheetScaffolding.retrySuggestions(
            input,
            ctx.authenticatedTeacher,
          ),
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
