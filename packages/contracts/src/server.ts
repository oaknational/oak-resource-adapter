import { initTRPC, TRPCError } from "@trpc/server";

import {
  lessonContextSchema,
  resourceAdapterApiContractVersionV1,
  resourceAdapterCapabilitiesResponseSchema,
  type LessonContext,
  type ResourceAdapterCapabilitiesResponse,
} from "./v1.js";
import type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";

export type { ResourceAdapterAuthenticatedTeacher } from "./authentication.js";

/** The service boundary required by the capabilities procedure. */
export type ResourceAdapterCapabilitiesService = Readonly<{
  getCapabilities: (
    lesson: LessonContext,
  ) =>
    Promise<ResourceAdapterCapabilitiesResponse> | ResourceAdapterCapabilitiesResponse;
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

const t_host = initTRPC.context<ResourceAdapterApiContextHost>().create();

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
