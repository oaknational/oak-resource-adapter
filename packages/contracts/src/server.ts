import { initTRPC, TRPCError } from "@trpc/server";

import {
  lessonContextSchema,
  resourceAdapterApiContractVersionV1,
  resourceAdapterCapabilitiesResponseSchema,
  type LessonContext,
  type ResourceAdapterCapabilitiesResponse,
} from "./v1.js";
import {
  resourceAdapterFeatureFlagsResponseSchema,
  type ResourceAdapterFeatureFlagsResponse,
} from "./internal.js";

/** The service boundary required by the capabilities procedure. */
export type ResourceAdapterCapabilitiesService = Readonly<{
  getCapabilities: (
    lesson: LessonContext,
  ) =>
    Promise<ResourceAdapterCapabilitiesResponse> | ResourceAdapterCapabilitiesResponse;
}>;

/** The service boundary required by the feature flags procedure. */
export type ResourceAdapterFeatureFlagService = Readonly<{
  getEnabledFlags: (
    target: ResourceAdapterAuthenticatedTeacher,
  ) =>
    Promise<ResourceAdapterFeatureFlagsResponse> | ResourceAdapterFeatureFlagsResponse;
}>;

/**
 * The application derives this only after verifying the host's bearer token.
 * It deliberately contains the small set of claims service procedures need.
 */
export type ResourceAdapterAuthenticatedTeacher = Readonly<{
  organisationId: string | null;
  teacherId: string;
}>;

/**
 * Public API context (served from `/trpc/v1`).
 * Contains only what external hosts (OWA) need.
 */
export type ResourceAdapterApiContextHost = Readonly<{
  apiContractVersion: number | null;
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  capabilities: ResourceAdapterCapabilitiesService;
}>;

/**
 * Internal API context (served from `/trpc/internal`).
 * Contains private infrastructure needed by the UI component.
 */
export type ResourceAdapterApiContextInternal = Readonly<{
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null;
  featureFlags: ResourceAdapterFeatureFlagService;
}>;

// Initialize separate tRPC instances for each router with their own context types
const t_host = initTRPC.context<ResourceAdapterApiContextHost>().create();
const t_internal = initTRPC.context<ResourceAdapterApiContextInternal>().create();

const versionedProcedure = t_host.procedure.use(({ ctx, next }) => {
  if (ctx.apiContractVersion !== resourceAdapterApiContractVersionV1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Unsupported Resource Adapter API contract version.",
    });
  }

  return next();
});

/**
 * Use for every teacher-facing procedure on the public API.
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
 * Use for every teacher-facing procedure on the internal API.
 * No version checking; internal endpoints are unversioned and can evolve freely.
 */
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

/**
 * The immutable v1 API router served from `/trpc/v1`.
 * Public contract for external hosts (OWA).
 *
 * Additive procedures and optional fields can remain on this router. A
 * breaking input, output, or transport change gets a separate v2 router and
 * endpoint, while this one remains deployed for older OWA packages.
 */
export const hostRouter = t_host.router({
  capabilities: t_host.router({
    get: authenticatedProcedure
      .input(lessonContextSchema)
      .output(resourceAdapterCapabilitiesResponseSchema)
      .query(({ ctx, input }) => ctx.capabilities.getCapabilities(input)),
  }),
});

export type HostRouter = typeof hostRouter;

/**
 * The internal API router served from `/trpc/internal`.
 * Private infrastructure for the UI component. Can evolve freely without versioning.
 * Future UI-specific features (analytics, caching, debug info) will live here.
 */
export const internalRouter = t_internal.router({
  featureFlags: t_internal.router({
    get: internalAuthenticatedProcedure
      .output(resourceAdapterFeatureFlagsResponseSchema)
      .query(({ ctx }) => ctx.featureFlags.getEnabledFlags(ctx.authenticatedTeacher)),
  }),
});

export type InternalRouter = typeof internalRouter;
