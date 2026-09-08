import type { LessonIdentity } from "@oaknational/resource-adapter-curriculum";

import { TransformationRequestError } from "./errors";
import {
  executePreparedTransformation,
  prepareTransformation,
  type ExecutePreparedTransformationConfig,
  type PreparedTransformation,
  type PreparePrompt,
  type TransformationRequest,
  type TransformationRun,
} from "./execute";
import type { OakMaterial, OakMaterialRequirement } from "../oak-material/material";
import { isRegisteredTransformationKind, transformationDefinitions } from "./registry";
import { executionType } from "./service";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";

export type TransformationMaterialResolution = Readonly<{
  material: OakMaterial;
  warnings: readonly string[];
}>;

export type ResolveTransformationMaterial = (
  requirements: readonly OakMaterialRequirement[],
  lesson: LessonIdentity | undefined,
  createInvoker?: (() => ResourceAdapterModelInvoker) | undefined,
) => Promise<TransformationMaterialResolution>;

export type RegisteredTransformationCommand = Omit<TransformationRequest, "material"> &
  Readonly<{
    kind: string;
    lesson?: LessonIdentity | undefined;
    material?: OakMaterial | undefined;
  }>;

export type PrepareRegisteredTransformationConfig = Readonly<{
  createInvoker?: (() => ResourceAdapterModelInvoker) | undefined;
  prepare?: PreparePrompt | undefined;
  resolveMaterial?: ResolveTransformationMaterial | undefined;
}>;

export type PreparedRegisteredTransformation = Readonly<{
  prepared: PreparedTransformation;
  warnings: readonly string[];
}>;

export async function prepareRegisteredTransformation(
  command: RegisteredTransformationCommand,
  config: PrepareRegisteredTransformationConfig = {},
): Promise<PreparedRegisteredTransformation> {
  if (!isRegisteredTransformationKind(command.kind)) {
    throw new TransformationRequestError(
      `Unknown transformation ${JSON.stringify(command.kind)}.`,
    );
  }

  const definition = transformationDefinitions[command.kind];
  const requirements = definition.materialRequirements ?? [];
  const { createInvoker, resolveMaterial } = config;
  const resolution =
    command.material === undefined && resolveMaterial !== undefined
      ? await resolveMaterial(requirements, command.lesson, createInvoker)
      : { material: command.material ?? {}, warnings: [] };
  const prepared = await prepareTransformation(
    definition,
    {
      contributionId: command.contributionId,
      document: command.document,
      material: resolution.material,
      params: command.params,
      targetBlockId: command.targetBlockId,
    },
    config.prepare === undefined ? {} : { prepare: config.prepare },
  );

  return { prepared, warnings: resolution.warnings };
}

export type TransformationPreview = Readonly<{
  execution: "deterministic" | "structured-model" | "text-model";
  kind: string;
  prompt: null | Readonly<{
    identifier: string;
    text: string;
  }>;
  status: "active" | "draft";
  warnings: readonly string[];
}>;

export async function previewRegisteredTransformation(
  command: RegisteredTransformationCommand,
  config: PrepareRegisteredTransformationConfig = {},
): Promise<TransformationPreview> {
  const { prepared, warnings } = await prepareRegisteredTransformation(command, config);
  const { definition, preparedPrompt } = prepared;

  return {
    execution: executionType(definition),
    kind: definition.kind,
    prompt:
      definition.execution.strategy === "model" && preparedPrompt !== undefined
        ? {
            identifier: definition.execution.prompt.identifier,
            text: preparedPrompt.text,
          }
        : null,
    status: definition.status,
    warnings,
  };
}

export async function executeRegisteredTransformation(
  command: RegisteredTransformationCommand,
  config: PrepareRegisteredTransformationConfig & ExecutePreparedTransformationConfig,
): Promise<Readonly<{ run: TransformationRun; warnings: readonly string[] }>> {
  const { prepared, warnings } = await prepareRegisteredTransformation(command, config);
  const run = await executePreparedTransformation(prepared, command, config);
  return { run, warnings };
}
