import * as z from "zod/mini";

import type { ResourceDocument } from "@oaknational/resource-document";

import { lessonContextSchema } from "./v1.js";

/**
 * Browser-safe wire contracts for the unversioned internal API used by
 * Resource Adapter-owned clients. Keep request and response schemas, along
 * with their inferred types, in this module. Server contexts, service
 * boundaries, and routers belong in `internal-server.ts`; host-facing
 * versioned contracts belong in `v1.ts`.
 */
export const resourceAdapterFeatureFlagsResponseSchema = z.readonly(
  z.array(z.string().check(z.minLength(1))),
);

export type ResourceAdapterFeatureFlagsResponse = z.infer<
  typeof resourceAdapterFeatureFlagsResponseSchema
>;

export const resourceAdapterSourceDocumentRequestSchema = z.object({
  capabilityId: z.string().check(z.minLength(1)),
  lesson: lessonContextSchema,
});

export type ResourceAdapterSourceDocumentRequest = z.infer<
  typeof resourceAdapterSourceDocumentRequestSchema
>;

export type ResourceAdapterSourceDocumentResponse = ResourceDocument;
