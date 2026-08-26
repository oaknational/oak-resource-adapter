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

const internalIdSchema = z.uuid();

export const worksheetScaffoldingJobKinds = [
  "suggestions.apply",
  "suggestions.generate",
] as const;

export type WorksheetScaffoldingJobKind = (typeof worksheetScaffoldingJobKinds)[number];

export const worksheetScaffoldingOpenRequestSchema = z.object({
  lesson: lessonContextSchema,
  /** The adaptation the teacher chose not to resume. Abandoned before the new one opens. */
  replacing: z.optional(internalIdSchema),
});

export const worksheetScaffoldingGetRequestSchema = z.object({
  adaptationId: internalIdSchema,
});

export const worksheetScaffoldingApplyRequestSchema = z.object({
  adaptationId: internalIdSchema,
  params: z.optional(z.record(z.string(), z.json())),
  suggestionId: internalIdSchema,
});

export type WorksheetScaffoldingOpenRequest = z.infer<
  typeof worksheetScaffoldingOpenRequestSchema
>;
export type WorksheetScaffoldingGetRequest = z.infer<
  typeof worksheetScaffoldingGetRequestSchema
>;
export type WorksheetScaffoldingApplyRequest = z.infer<
  typeof worksheetScaffoldingApplyRequestSchema
>;

/** Unfinished work the teacher can be offered back before a new adaptation opens. */
export type WorksheetScaffoldingResumable = Readonly<{
  adaptationId: string;
  scaffoldCount: number;
  updatedAt: string;
}>;

export type WorksheetScaffoldingEntry =
  | Readonly<{ outcome: "opened"; state: WorksheetScaffoldingState }>
  | Readonly<{ outcome: "resumable"; resumable: WorksheetScaffoldingResumable }>;

export type WorksheetScaffoldingState = Readonly<{
  adaptationId: string;
  document: ResourceDocument;
  job: null | Readonly<{
    failureMessage: string | null;
    id: string;
    kind: WorksheetScaffoldingJobKind;
    status: "failed" | "queued" | "running" | "succeeded";
  }>;
  suggestions: readonly Readonly<{
    id: string;
    kind: string;
    label: string;
    params: Readonly<Record<string, unknown>>;
    reason: string;
    targetBlockId: string | null;
  }>[];
}>;
