import { initTRPC, TRPCError } from "@trpc/server";

import {
  clientErrorReportReceiptSchema,
  clientErrorReportSchema,
  lessonContextSchema,
  resourceAdapterApiContractVersionV1,
  resourceAdapterCapabilitiesResponseSchema,
  type ClientErrorReport,
  type LessonContext,
  type ResourceAdapterCapabilitiesResponse,
} from "./v1.js";

/** The service boundary required by the capabilities procedure. */
export type ResourceAdapterCapabilitiesService = Readonly<{
  getCapabilities: (
    lesson: LessonContext,
  ) =>
    Promise<ResourceAdapterCapabilitiesResponse> | ResourceAdapterCapabilitiesResponse;
}>;

/**
 * The service boundary required by the client-error reporting procedure.
 * Implementations must swallow their own failures: reporting is observability
 * and must never turn into a client-visible error.
 */
export type ResourceAdapterClientErrorReportService = Readonly<{
  report: (report: ClientErrorReport) => Promise<void> | void;
}>;

/**
 * The API application creates this context for every request. Future slices
 * will add verified teacher identity, feature flags, and job services here.
 */
export type ResourceAdapterApiContext = Readonly<{
  apiContractVersion: number | null;
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  capabilities: ResourceAdapterCapabilitiesService;
  clientErrorReports: ResourceAdapterClientErrorReportService;
}>;

/**
 * The application derives this only after verifying the host's bearer token.
 * It deliberately contains the small set of claims service procedures need.
 */
export type ResourceAdapterAuthenticatedTeacher = Readonly<{
  organisationId: string | null;
  teacherId: string;
}>;

const t = initTRPC.context<ResourceAdapterApiContext>().create();
const versionedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.apiContractVersion !== resourceAdapterApiContractVersionV1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Unsupported Resource Adapter API contract version.",
    });
  }

  return next();
});

/**
 * Use for every teacher-facing procedure once Clerk verification is wired in.
 * Health checks remain outside tRPC and do not use this procedure.
 */
export const authenticatedProcedure = versionedProcedure.use(({ ctx, next }) => {
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
});

/**
 * The immutable v1 API router served from `/trpc/v1`.
 *
 * Additive procedures and optional fields can remain on this router. A
 * breaking input, output, or transport change gets a separate v2 router and
 * endpoint, while this one remains deployed for older OWA packages.
 */
export const appRouterV1 = t.router({
  capabilities: t.router({
    get: authenticatedProcedure
      .input(lessonContextSchema)
      .output(resourceAdapterCapabilitiesResponseSchema)
      .query(({ ctx, input }) => ctx.capabilities.getCapabilities(input)),
  }),
  clientErrors: t.router({
    report: authenticatedProcedure
      .input(clientErrorReportSchema)
      .output(clientErrorReportReceiptSchema)
      .mutation(async ({ ctx, input }) => {
        await ctx.clientErrorReports.report(input);
        return { received: true } as const;
      }),
  }),
});

export type AppRouterV1 = typeof appRouterV1;
