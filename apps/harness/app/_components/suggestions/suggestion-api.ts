import { z } from "zod";

import { adapterProxyPath } from "../../harness-api";
import type { ResourceDocument } from "@oaknational/resource-document";

const targetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("document") }),
  z.strictObject({
    nodeTypes: z.array(z.string()).min(1),
    scope: z.literal("node"),
  }),
]);

const supportLevelSchema = z.strictObject({
  description: z.string(),
  level: z.enum(["low", "mid", "high"]),
});

const flowSchema = z.strictObject({
  capabilityId: z.string(),
  id: z.string(),
  maxSuggestions: z.number().int().positive(),
  role: z.string(),
  transformationKinds: z.array(z.string()),
});

const candidateSchema = z.strictObject({
  barriers: z.array(z.string()).optional(),
  eligibleTargets: z.discriminatedUnion("scope", [
    z.strictObject({ scope: z.literal("document") }),
    z.strictObject({
      blockIds: z.array(z.string()).min(1),
      scope: z.literal("node"),
    }),
  ]),
  kind: z.string(),
  label: z.string(),
  outputs: z.array(z.enum(["companion-document", "revised-resource"])).min(1),
  supportLevels: z.array(supportLevelSchema).min(1).optional(),
  target: targetSchema,
});

const catalogueResponseSchema = z.strictObject({ flows: z.array(flowSchema) });

const previewResponseSchema = z.strictObject({
  candidates: z.array(candidateSchema),
  flow: flowSchema,
  prompt: z.strictObject({
    identifier: z.string(),
    text: z.string(),
  }),
});

const suggestionSchema = z.strictObject({
  kind: z.string(),
  label: z.string(),
  params: z.record(z.string(), z.unknown()),
  reason: z.string(),
  targetBlockId: z.string().nullable(),
});

const runResponseSchema = z.strictObject({
  flowId: z.string(),
  suggestions: z.array(suggestionSchema),
});

export type SuggestionCatalogue = z.infer<typeof catalogueResponseSchema>;
export type SuggestionFlow = z.infer<typeof flowSchema>;
export type SuggestionPreviewResponse = z.infer<typeof previewResponseSchema>;
export type SuggestionRunResponse = z.infer<typeof runResponseSchema>;

export type SuggestionCommand = Readonly<{
  document: ResourceDocument;
  flowId: string;
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

export async function fetchSuggestionCatalogue(): Promise<SuggestionCatalogue> {
  const response = await fetch(`${adapterProxyPath}/dev/suggestions/catalogue`);
  return read(response, catalogueResponseSchema, "a suggestion-flow catalogue");
}

async function postSuggestion<TSchema extends z.ZodType>(
  action: "preview" | "run",
  command: SuggestionCommand,
  schema: TSchema,
  signal?: AbortSignal,
): Promise<z.output<TSchema>> {
  const response = await fetch(`${adapterProxyPath}/dev/suggestions/${action}`, {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    ...(signal === undefined ? {} : { signal }),
  });
  return read(response, schema, `a suggestion ${action}`);
}

export function previewSuggestions(command: SuggestionCommand, signal?: AbortSignal) {
  return postSuggestion("preview", command, previewResponseSchema, signal);
}

export function runSuggestions(command: SuggestionCommand, signal?: AbortSignal) {
  return postSuggestion("run", command, runResponseSchema, signal);
}
