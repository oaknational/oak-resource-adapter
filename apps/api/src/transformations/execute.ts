import { preparePrompt } from "@oaknational/resource-adapter-ai";
import {
  getResourceNodeById,
  parseResourceDocument,
} from "@oaknational/resource-document";
import { z } from "zod";

import type {
  ModelInvocationMeta,
  PreparedPrompt,
  PromptTemplate,
  TextModelOutputResult,
} from "@oaknational/resource-adapter-ai";
import type { ResourceDocument, ResourceNode } from "@oaknational/resource-document";

import { DEFAULT_TRANSFORMATION_ROLE } from "../ai/model-roles";
import type { ResourceAdapterModelInvoker } from "../ai/model-roles";
import { TransformationRequestError } from "./errors";
import type { TransformationMaterial } from "./oak-material/material";
import { assertRequiredMaterial } from "./oak-material/requirements";
import { transformationPromptVariables } from "./prompt-input";
import { SUPPORT_LEVELS, type SupportLevel } from "./support-level";
import type {
  TransformationDefinition,
  TransformationDocuments,
  TransformationOutput,
  TransformationParams,
} from "./types";

export type TransformationRequest = Readonly<{
  /** Identifies nodes this run adds. Required when applying a contribution. */
  contributionId?: string | undefined;
  /** The adaptation head, or the current document in a synchronous experiment. */
  document: ResourceDocument;
  material?: TransformationMaterial | undefined;
  params?: unknown;
  /** Required by a node-targeted kind, and rejected by a document kind. */
  targetBlockId?: string | undefined;
}>;

export type UnusableModelReason =
  "INCOMPLETE" | "OUTPUT_MISSING" | "REFUSAL" | "STRUCTURED_OUTPUT_FAILURE";

export type TransformationDocumentOutput = Readonly<{
  document: ResourceDocument;
  purpose: TransformationOutput;
}>;

export type TransformationRun =
  | Readonly<{
      meta?: ModelInvocationMeta;
      outcome: "APPLIED";
      outputs: readonly [
        TransformationDocumentOutput,
        ...TransformationDocumentOutput[],
      ];
    }>
  /** Deliberately limited to draft prompt experiments. */
  | Readonly<{ meta: ModelInvocationMeta; outcome: "TEXT"; text: string }>
  | Readonly<{
      meta: ModelInvocationMeta;
      outcome: "UNUSABLE";
      reason: UnusableModelReason;
    }>;

export type PreparePrompt = (
  params: Readonly<{
    template: PromptTemplate;
    variables: Record<string, string>;
  }>,
) => Promise<PreparedPrompt>;

export type PreparedTransformation = Readonly<{
  definition: TransformationDefinition;
  document: ResourceDocument;
  material: TransformationMaterial;
  params: TransformationParams;
  preparedPrompt?: PreparedPrompt | undefined;
  supportLevel?: SupportLevel | undefined;
  targetNode?: ResourceNode | undefined;
}>;

export type PrepareTransformationConfig = Readonly<{
  /** Injectable for previews and synchronous dev runs without prompt persistence. */
  prepare?: PreparePrompt;
}>;

type ModelInvokerConfig =
  | Readonly<{ createInvoker: () => ResourceAdapterModelInvoker }>
  | Readonly<{ invoker: ResourceAdapterModelInvoker }>;

export type ExecutePreparedTransformationConfig = Readonly<{
  correlationKey?: string | undefined;
  signal?: AbortSignal | undefined;
}> &
  ModelInvokerConfig;

export type ExecuteTransformationConfig = PrepareTransformationConfig &
  ExecutePreparedTransformationConfig;

const supportLevelSchema = z.enum(SUPPORT_LEVELS);

/** Params live in a jsonb column, so a caller's arguments have to survive that. */
function assertStorableParams(
  transformationKind: string,
  params: TransformationParams,
): void {
  if (!z.json().safeParse(params).success) {
    throw new Error(
      `Transformation ${transformationKind} was given params that cannot be stored as JSON.`,
    );
  }
}

function resolveTargetNode(
  definition: TransformationDefinition,
  document: ResourceDocument,
  targetBlockId: string | undefined,
): ResourceNode | undefined {
  if (definition.target.scope === "document") {
    if (targetBlockId !== undefined) {
      throw new TransformationRequestError(
        `${definition.kind} applies to a whole document, not a node.`,
      );
    }

    return undefined;
  }

  if (targetBlockId === undefined) {
    throw new TransformationRequestError(
      `${definition.kind} needs the node it applies to.`,
    );
  }

  const node = getResourceNodeById(document, targetBlockId);
  if (node === undefined) {
    throw new TransformationRequestError(
      `${definition.kind} was given node ${JSON.stringify(targetBlockId)}, which the document does not contain.`,
    );
  }

  if (!definition.target.nodeTypes.includes(node.type)) {
    throw new TransformationRequestError(
      `${definition.kind} cannot target a ${node.type} node; expected ${definition.target.nodeTypes.join(" or ")}.`,
    );
  }

  return node;
}

/**
 * Pairs each produced document with the purpose at the same position, so a
 * transformation producing a different number of documents than it declared
 * fails here.
 */
function toOutputs(
  definition: TransformationDefinition,
  documents: TransformationDocuments,
): readonly [TransformationDocumentOutput, ...TransformationDocumentOutput[]] {
  const { outputs } = definition;

  if (documents.length !== outputs.length) {
    throw new Error(
      `${definition.kind} declares ${outputs.length} output(s) but produced ${documents.length}.`,
    );
  }

  const [firstDocument, ...restDocuments] = documents;
  const [firstPurpose, ...restPurposes] = outputs;

  return [
    { document: parseResourceDocument(firstDocument), purpose: firstPurpose },
    ...restDocuments.map((document, index) => ({
      document: parseResourceDocument(document),
      // Length is checked above, so every remaining document has a purpose.
      purpose: restPurposes[index] as TransformationOutput,
    })),
  ];
}

/** Validates a request and renders its prompt, without invoking a model. */
export async function prepareTransformation(
  definition: TransformationDefinition,
  request: TransformationRequest,
  config: PrepareTransformationConfig = {},
): Promise<PreparedTransformation> {
  const document = parseResourceDocument(request.document);
  const params = definition.params.parse(request.params ?? {});
  assertStorableParams(definition.kind, params);
  const material = request.material ?? {};
  assertRequiredMaterial(
    definition.kind,
    definition.materialRequirements ?? [],
    material,
  );
  const targetNode = resolveTargetNode(definition, document, request.targetBlockId);
  const supportLevel = supportLevelSchema.safeParse(params["supportLevel"]);
  const resolved = {
    definition,
    document,
    material,
    params,
    ...(supportLevel.success ? { supportLevel: supportLevel.data } : {}),
    targetNode,
  };

  if (definition.execution.strategy === "deterministic") {
    return resolved;
  }

  const variables = transformationPromptVariables(
    definition,
    document,
    material,
    params,
    targetNode,
    definition.execution.prompt.template,
  );
  const prepare = config.prepare ?? preparePrompt;
  const preparedPrompt = await prepare({
    template: definition.execution.prompt,
    variables,
  });

  return { ...resolved, preparedPrompt };
}

export async function executePreparedTransformation(
  prepared: PreparedTransformation,
  request: Pick<TransformationRequest, "contributionId">,
  config: ExecutePreparedTransformationConfig,
): Promise<TransformationRun> {
  const { definition, document, material, params, supportLevel, targetNode } = prepared;
  const { execution } = definition;

  if (execution.strategy === "deterministic") {
    return {
      outcome: "APPLIED",
      outputs: toOutputs(
        definition,
        execution.apply(document, { params, supportLevel, targetNode }),
      ),
    };
  }

  if (prepared.preparedPrompt === undefined) {
    throw new Error(`${definition.kind} has no prepared prompt.`);
  }

  const invoker = "createInvoker" in config ? config.createInvoker() : config.invoker;
  const invocation = {
    ...(config.correlationKey === undefined
      ? {}
      : { correlationKey: config.correlationKey }),
    promptTemplateId: prepared.preparedPrompt.promptTemplateId,
    request: { input: prepared.preparedPrompt.text },
    role: execution.role ?? DEFAULT_TRANSFORMATION_ROLE,
    ...(config.signal === undefined ? {} : { signal: config.signal }),
  };

  if (execution.contribution === undefined) {
    if (definition.status !== "draft") {
      throw new Error(`${definition.kind} is active but has no contribution.`);
    }
    const result: TextModelOutputResult = await invoker.invokeText(invocation);
    return result.outcome === "SUCCESS"
      ? { meta: result.meta, outcome: "TEXT", text: result.output }
      : { meta: result.meta, outcome: "UNUSABLE", reason: result.outcome };
  }

  if (request.contributionId === undefined) {
    throw new TransformationRequestError(
      `${definition.kind} needs a contribution ID to attribute its work.`,
    );
  }

  const contribution = execution.contribution.prepare({
    contributionId: request.contributionId,
    document,
    material,
    params,
    supportLevel,
    targetNode,
    transformationKind: definition.kind,
  });
  const result = await invoker.invokeStructured({
    ...invocation,
    schema: contribution.schema,
    schemaName: contribution.name,
  });

  if (result.outcome !== "SUCCESS") {
    return { meta: result.meta, outcome: "UNUSABLE", reason: result.outcome };
  }

  return {
    meta: result.meta,
    outcome: "APPLIED",
    outputs: toOutputs(definition, contribution.apply(result.output)),
  };
}

export async function executeTransformation(
  definition: TransformationDefinition,
  request: TransformationRequest,
  config: ExecuteTransformationConfig,
): Promise<TransformationRun> {
  const prepared = await prepareTransformation(definition, request, config);
  return executePreparedTransformation(prepared, request, config);
}
