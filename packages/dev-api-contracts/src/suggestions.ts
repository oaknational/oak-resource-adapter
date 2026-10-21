import { z } from "zod";

import {
  lessonIdentitySchema,
  resourceDocumentInputSchema,
  type WithResourceDocument,
} from "./requests.js";
import { availableTransformationSchema } from "./transformations.js";

const suggestionFlowSchema = z
  .object({
    capabilityId: z.string(),
    id: z.string(),
    label: z.string(),
    maxSuggestions: z.number().int().positive(),
    role: z.string(),
    transformationKinds: z.array(z.string()).readonly(),
  })
  .readonly();

export type SuggestionFlow = z.infer<typeof suggestionFlowSchema>;

export const suggestionCatalogueSchema = z
  .object({ flows: z.array(suggestionFlowSchema).readonly() })
  .readonly();

export type SuggestionCatalogue = z.infer<typeof suggestionCatalogueSchema>;

const appliedTransformationSchema = z.strictObject({
  contributionId: z.string().trim().min(1).max(200).optional(),
  kind: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()),
  targetBlockId: z.string().trim().min(1).max(256).optional(),
});

export const suggestionCommandSchema = z.strictObject({
  appliedTransformations: z.array(appliedTransformationSchema).default([]),
  document: resourceDocumentInputSchema,
  flowId: z.string().trim().min(1).max(200),
  lesson: lessonIdentitySchema.optional(),
});

export type SuggestionCommand = WithResourceDocument<
  z.input<typeof suggestionCommandSchema>
>;

const suggestionCandidateSchema = availableTransformationSchema
  .extend({
    eligibleTargets: z.discriminatedUnion("scope", [
      z.object({ scope: z.literal("document") }).readonly(),
      z
        .object({
          blockIds: z.array(z.string()).min(1).readonly(),
          scope: z.literal("node"),
        })
        .readonly(),
    ]),
  })
  .readonly();

export const suggestionPreviewSchema = z
  .object({
    candidates: z.array(suggestionCandidateSchema).readonly(),
    flow: suggestionFlowSchema,
    prompt: z
      .object({
        identifier: z.string(),
        text: z.string(),
      })
      .readonly(),
  })
  .readonly();

export type SuggestionPreview = z.infer<typeof suggestionPreviewSchema>;

const suggestionSchema = z
  .object({
    kind: z.string(),
    label: z.string(),
    params: z.record(z.string(), z.unknown()).readonly(),
    reason: z.string(),
    targetBlockId: z.string().nullable(),
  })
  .readonly();

export const suggestionRunResponseSchema = z
  .object({
    flowId: z.string(),
    suggestions: z.array(suggestionSchema).readonly(),
  })
  .readonly();

export type SuggestionRunResponse = z.infer<typeof suggestionRunResponseSchema>;
