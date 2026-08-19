import { resourceDocumentSchema } from "@oaknational/resource-document";
import { z } from "zod";

import { adapterProxyPath } from "../../harness-api";
import type { LessonScenario } from "../../scenario-types";
import type { ResourceDocument } from "@oaknational/resource-document";

const targetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("document") }),
  z.strictObject({
    scope: z.literal("node"),
    nodeTypes: z.array(z.string()).min(1),
  }),
]);

const materialRequirementSchema = z.strictObject({
  available: z.boolean(),
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
  unavailableBecause: z.string().optional(),
});

const supportLevelSchema = z.strictObject({
  description: z.string(),
  level: z.enum(["low", "mid", "high"]),
});

const transformationCatalogueItemSchema = z.strictObject({
  barriers: z.array(z.string()).optional(),
  execution: z.enum(["deterministic", "structured-model", "text-model"]),
  kind: z.string(),
  label: z.string(),
  materialRequirements: z.array(materialRequirementSchema),
  outputs: z.array(z.enum(["companion-document", "revised-resource"])).min(1),
  status: z.enum(["active", "draft"]),
  supportLevels: z.array(supportLevelSchema).min(1).optional(),
  target: targetSchema,
});

const oakMaterialSchema = z.strictObject({
  available: z.boolean(),
  key: z.string(),
  label: z.string(),
  promptHeading: z.string(),
  unavailableBecause: z.string().optional(),
});

export type OakMaterialSummary = z.infer<typeof oakMaterialSchema>;

const catalogueResponseSchema = z.strictObject({
  material: z.array(oakMaterialSchema),
  transformations: z.array(transformationCatalogueItemSchema),
});

export type TransformationCatalogue = z.infer<typeof catalogueResponseSchema>;

export type TransformationCatalogueItem = z.infer<
  typeof transformationCatalogueItemSchema
>;

const previewResponseSchema = z.strictObject({
  execution: z.enum(["deterministic", "structured-model", "text-model"]),
  kind: z.string(),
  prompt: z
    .strictObject({
      identifier: z.string(),
      text: z.string(),
      version: z.number().int().positive(),
    })
    .nullable(),
  status: z.enum(["active", "draft"]),
  warnings: z.array(z.string()),
});

export type TransformationPreviewResponse = z.infer<typeof previewResponseSchema>;

const invocationMetaSchema = z.strictObject({
  invocationId: z.string(),
  providerResponseId: z.string().optional(),
  usage: z
    .strictObject({
      inputTokens: z.number(),
      outputTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
});

const transformationRunSchema = z.discriminatedUnion("outcome", [
  z.strictObject({
    meta: invocationMetaSchema.optional(),
    outcome: z.literal("APPLIED"),
    outputs: z
      .array(
        z.strictObject({
          document: resourceDocumentSchema,
          purpose: z.enum(["companion-document", "revised-resource"]),
        }),
      )
      .min(1),
  }),
  z.strictObject({
    meta: invocationMetaSchema,
    outcome: z.literal("TEXT"),
    text: z.string(),
  }),
  z.strictObject({
    meta: invocationMetaSchema,
    outcome: z.literal("UNUSABLE"),
    reason: z.enum([
      "INCOMPLETE",
      "OUTPUT_MISSING",
      "REFUSAL",
      "STRUCTURED_OUTPUT_FAILURE",
    ]),
  }),
]);

const runResponseSchema = z.strictObject({
  run: transformationRunSchema,
  warnings: z.array(z.string()),
});

export type TransformationRunResponse = z.infer<typeof runResponseSchema>;

export type TransformationCommand = Readonly<{
  contributionId?: string | undefined;
  document: ResourceDocument;
  kind: string;
  lesson: Pick<LessonScenario["lesson"], "lessonSlug" | "programmeSlug">;
  params: Record<string, unknown>;
  targetBlockId?: string | undefined;
}>;

async function readError(response: Response): Promise<Error> {
  const parsed = z
    .object({ error: z.string() })
    .safeParse(await response.json().catch(() => null));
  return new Error(
    parsed.success ? parsed.data.error : `The API returned HTTP ${response.status}.`,
  );
}

async function read<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  what: string,
): Promise<z.output<TSchema>> {
  if (!response.ok) {
    throw await readError(response);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`The API returned ${what} in an unrecognised shape.`);
  }
  return parsed.data;
}

export async function fetchTransformationCatalogue(): Promise<TransformationCatalogue> {
  const response = await fetch(`${adapterProxyPath}/dev/transformations/catalogue`);
  return read(response, catalogueResponseSchema, "a transformation catalogue");
}

async function postTransformation<TSchema extends z.ZodType>(
  action: "preview" | "run",
  command: TransformationCommand,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.output<TSchema>> {
  const response = await fetch(`${adapterProxyPath}/dev/transformations/${action}`, {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });
  return read(response, schema, `a transformation ${action}`);
}

export function previewTransformation(
  command: TransformationCommand,
  signal?: AbortSignal,
) {
  return postTransformation("preview", command, previewResponseSchema, signal);
}

export function runTransformation(
  command: TransformationCommand,
  signal?: AbortSignal,
) {
  return postTransformation("run", command, runResponseSchema, signal);
}
