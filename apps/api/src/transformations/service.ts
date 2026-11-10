import type { TransformationCatalogueItem } from "@oaknational/resource-adapter-dev-api-contracts";
import { raLogger } from "@oaknational/resource-adapter-logger";

import { requireCapability } from "../capabilities/registry";
import { OAK_MATERIAL, oakMaterialIsAvailable } from "../oak-material/catalogue";
import { transformationDefinitions } from "./registry";
import { evaluateTransformation } from "./evaluate-transformation";
import type {
  AvailableTransformation,
  TransformationAvailabilityContext,
  TransformationDefinition,
} from "./types";

const log = raLogger("transformations");

export function executionType(
  definition: TransformationDefinition,
): TransformationCatalogueItem["execution"] {
  if (definition.execution.strategy === "deterministic") {
    return "deterministic";
  }
  return definition.execution.contribution === undefined
    ? "text-model"
    : "structured-model";
}

export function toCatalogueItem(
  definition: TransformationDefinition,
): TransformationCatalogueItem {
  const {
    barriers,
    inputs,
    kind,
    label,
    materialRequirements = [],
    outputs,
    status,
    suggestion,
    target,
  } = definition;

  return {
    barriers,
    execution: executionType(definition),
    inputs,
    kind,
    label,
    materialRequirements: materialRequirements.map(({ key, required }) => {
      const part = OAK_MATERIAL[key];
      const available = oakMaterialIsAvailable(key);

      return {
        available,
        key,
        label: part.label,
        required,
        ...(available || part.unavailableBecause === undefined
          ? {}
          : { unavailableBecause: part.unavailableBecause }),
      };
    }),
    outputs,
    status,
    suggestion,
    target,
  };
}

export function listRegisteredTransformations(): readonly TransformationCatalogueItem[] {
  return Object.values(transformationDefinitions).map(toCatalogueItem);
}

/** The definitions offered, in the order given, each narrowed by any rule that removed levels. */
export function evaluateTransformations(
  definitions: ReadonlyArray<TransformationDefinition>,
  context: TransformationAvailabilityContext,
): readonly TransformationDefinition[] {
  return definitions.flatMap((definition) => {
    const evaluation = evaluateTransformation(definition, context);
    if ("refusal" in evaluation) {
      log.info(
        {
          kind: definition.kind,
          targetBlockId: context.targetBlockId,
          refusal: evaluation.refusal,
        },
        "transformation refused",
      );
      return [];
    }
    return [evaluation.offered];
  });
}

export function toAvailableTransformation({
  barriers,
  inputs,
  kind,
  label,
  outputs,
  suggestion,
  target,
}: TransformationDefinition): AvailableTransformation {
  return { barriers, inputs, kind, label, outputs, suggestion, target };
}

export function transformationsForCapability(
  capabilityId: string,
): ReadonlyArray<TransformationDefinition> {
  return requireCapability(capabilityId).transformationKinds.map(
    (kind) => transformationDefinitions[kind],
  );
}

export function listTransformationsForCapability(
  context: TransformationAvailabilityContext,
): readonly AvailableTransformation[] {
  return evaluateTransformations(
    transformationsForCapability(context.capabilityId),
    context,
  ).map(toAvailableTransformation);
}
