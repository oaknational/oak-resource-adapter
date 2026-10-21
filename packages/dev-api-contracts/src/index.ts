import { transformationInputSchema } from "@oaknational/resource-adapter-contracts/internal";
import { resourceDocumentSchema } from "@oaknational/resource-document/schema";
import { z } from "zod";

// Response schemas strip fields they do not recognise, so an additive API change
// cannot break the harness. Only the request schema is strict.

export const transformationStatusSchema = z.enum(["active", "draft", "retired"]);

export type TransformationStatus = z.infer<typeof transformationStatusSchema>;

const transformationExecutionSchema = z.enum([
  "deterministic",
  "structured-model",
  "text-model",
]);

export const targetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("document") }).readonly(),
  z
    .object({
      nodeTypes: z.array(z.string()).min(1).readonly(),
      scope: z.literal("node"),
    })
    .readonly(),
]);

export { transformationInputSchema };

export const suggestionGuidanceSchema = z
  .object({
    avoidWhen: z.string(),
    description: z.string(),
    useWhen: z.string(),
  })
  .readonly();

const transformationOutputSchema = z.enum(["companion-document", "revised-resource"]);

export const transformationOutputsSchema = z
  .array(transformationOutputSchema)
  .min(1)
  .readonly();

const materialRequirementSchema = z
  .object({
    available: z.boolean(),
    key: z.string(),
    label: z.string(),
    required: z.boolean(),
    unavailableBecause: z.string().optional(),
  })
  .readonly();

const transformationCatalogueItemSchema = z
  .object({
    barriers: z.array(z.string()).readonly().optional(),
    execution: transformationExecutionSchema,
    inputs: z.array(transformationInputSchema).readonly().optional(),
    kind: z.string(),
    label: z.string(),
    materialRequirements: z.array(materialRequirementSchema).readonly(),
    outputs: transformationOutputsSchema,
    status: transformationStatusSchema,
    suggestion: suggestionGuidanceSchema,
    target: targetSchema,
  })
  .readonly();

export type TransformationCatalogueItem = z.infer<
  typeof transformationCatalogueItemSchema
>;

const oakMaterialSchema = z
  .object({
    available: z.boolean(),
    key: z.string(),
    label: z.string(),
    promptHeading: z.string(),
    unavailableBecause: z.string().optional(),
  })
  .readonly();

export type OakMaterialSummary = z.infer<typeof oakMaterialSchema>;

const capabilityCatalogueItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    resourceType: z.string(),
    suggestionFlowId: z.string().optional(),
    transformationKinds: z.array(z.string()).readonly(),
  })
  .readonly();

export type CapabilityCatalogueItem = z.infer<typeof capabilityCatalogueItemSchema>;

export const transformationCatalogueSchema = z
  .object({
    capabilities: z.array(capabilityCatalogueItemSchema).readonly(),
    material: z.array(oakMaterialSchema).readonly(),
    transformations: z.array(transformationCatalogueItemSchema).readonly(),
  })
  .readonly();

export type TransformationCatalogue = z.infer<typeof transformationCatalogueSchema>;

/** `document` stays unknown: the API parses it with `parseResourceDocument`, which also upgrades older schema versions. */
export const transformationCommandSchema = z.strictObject({
  contributionId: z.string().trim().min(1).max(200).optional(),
  document: z.unknown(),
  kind: z.string().trim().min(1),
  lesson: z
    .strictObject({
      lessonSlug: z.string().trim().min(1),
      programmeSlug: z.string().trim().min(1),
    })
    .optional(),
  params: z.unknown().optional(),
  targetBlockId: z.string().trim().min(1).max(256).optional(),
});

export type TransformationCommand = z.input<typeof transformationCommandSchema>;

export const transformationPreviewSchema = z
  .object({
    execution: transformationExecutionSchema,
    kind: z.string(),
    prompt: z
      .object({
        identifier: z.string(),
        text: z.string(),
      })
      .readonly()
      .nullable(),
    status: transformationStatusSchema,
    warnings: z.array(z.string()).readonly(),
  })
  .readonly();

export type TransformationPreview = z.infer<typeof transformationPreviewSchema>;

const invocationMetaSchema = z
  .object({
    invocationId: z.string(),
    providerResponseId: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        totalTokens: z.number(),
      })
      .readonly()
      .optional(),
  })
  .readonly();

const transformationRunSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      meta: invocationMetaSchema.optional(),
      outcome: z.literal("APPLIED"),
      outputs: z
        .array(
          z
            .object({
              document: resourceDocumentSchema,
              purpose: transformationOutputSchema,
            })
            .readonly(),
        )
        .min(1)
        .readonly(),
    })
    .readonly(),
  z
    .object({
      meta: invocationMetaSchema,
      outcome: z.literal("TEXT"),
      text: z.string(),
    })
    .readonly(),
  z
    .object({
      meta: invocationMetaSchema,
      outcome: z.literal("UNUSABLE"),
      reason: z.enum([
        "INCOMPLETE",
        "OUTPUT_MISSING",
        "REFUSAL",
        "STRUCTURED_OUTPUT_FAILURE",
      ]),
    })
    .readonly(),
]);

export const transformationRunResponseSchema = z
  .object({
    run: transformationRunSchema,
    warnings: z.array(z.string()).readonly(),
  })
  .readonly();

export type TransformationRunResponse = z.infer<typeof transformationRunResponseSchema>;
