import {
  getResourceNodeById,
  getResourceNodesByType,
} from "@oaknational/resource-document";

import { requireCapability } from "../capabilities/registry";
import { OAK_MATERIAL, oakMaterialIsAvailable } from "../oak-material/catalogue";
import { transformationDefinitions } from "./registry";
import type {
  AvailableTransformation,
  TransformationAvailabilityContext,
  TransformationCatalogueItem,
  TransformationDefinition,
} from "./types";

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
    kind,
    label,
    materialRequirements = [],
    outputs,
    status,
    suggestion,
    supportLevels,
    target,
  } = definition;

  return {
    barriers,
    execution: executionType(definition),
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
    supportLevels,
    target,
  };
}

export function listRegisteredTransformations(): readonly TransformationCatalogueItem[] {
  return Object.values(transformationDefinitions).map(toCatalogueItem);
}

/** A transformation whose required material has no source cannot run, so it is not offered. */
function hasResolvableMaterial(definition: TransformationDefinition): boolean {
  return (definition.materialRequirements ?? [])
    .filter(({ required }) => required)
    .every(({ key }) => oakMaterialIsAvailable(key));
}

function hasEligibleTarget(
  definition: TransformationDefinition,
  context: TransformationAvailabilityContext,
): boolean {
  if (definition.target.scope === "document") {
    return context.targetBlockId === undefined;
  }

  if (context.targetBlockId !== undefined) {
    const node = getResourceNodeById(context.document, context.targetBlockId);
    return node !== undefined && definition.target.nodeTypes.includes(node.type);
  }

  return definition.target.nodeTypes.some(
    (type) => getResourceNodesByType(context.document, type).length > 0,
  );
}

export function evaluateTransformations(
  definitions: ReadonlyArray<TransformationDefinition>,
  context: TransformationAvailabilityContext,
): readonly AvailableTransformation[] {
  return definitions
    .filter(
      (definition) =>
        definition.status === "active" &&
        hasResolvableMaterial(definition) &&
        hasEligibleTarget(definition, context) &&
        definition.isAvailable(context),
    )
    .map(({ barriers, kind, label, outputs, suggestion, supportLevels, target }) => ({
      barriers,
      kind,
      label,
      outputs,
      suggestion,
      supportLevels,
      target,
    }));
}

/** Resolves active kinds a capability offers, preserving capability order. */
export function transformationsForCapability(
  capabilityId: string,
): ReadonlyArray<TransformationDefinition> {
  return requireCapability(capabilityId)
    .transformationKinds.map((kind) => transformationDefinitions[kind])
    .filter((definition) => definition.status === "active");
}

export function listTransformationsForCapability(
  context: TransformationAvailabilityContext,
): readonly AvailableTransformation[] {
  return evaluateTransformations(
    transformationsForCapability(context.capabilityId),
    context,
  );
}
