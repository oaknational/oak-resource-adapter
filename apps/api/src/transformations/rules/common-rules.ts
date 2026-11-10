import type { TransformationDefinition, TransformationRule } from "../types";
import { appliedOncePerTargetRule } from "./applied-once-per-target";
import { excludesRule } from "./excludes";
import { materialSourceRule } from "./material-source";
import { statusRule } from "./status";
import { targetRule } from "./target";

/** Checked for every kind, before its own rules, configured from its declaration. */
export function commonTransformationRules(
  definition: TransformationDefinition,
): readonly TransformationRule[] {
  return [
    statusRule(
      {
        id: "status",
        label: "Is active",
        condition: "It's still a draft, or has been retired",
      },
      { offeredStatuses: ["active"] },
    ),
    materialSourceRule(
      {
        id: "material-source",
        label: "Can read the lesson material it needs",
        condition: "It needs lesson material ORA can't read yet",
        description:
          "Material with no source can't be read for any lesson, so the scaffold could never run.",
      },
      {
        requiredKeys: (definition.materialRequirements ?? [])
          .filter(({ required }) => required)
          .map(({ key }) => key),
      },
    ),
    targetRule(
      {
        id: "target",
        label: "Has something in the resource to change",
        condition: "The resource has nothing it can change",
      },
      { target: definition.target },
    ),
    excludesRule(
      {
        id: "excludes",
        label: "Doesn't conflict with a scaffold already there",
        condition:
          "The question or task already has a scaffold it can't be combined with",
      },
      { kinds: definition.excludes ?? [] },
    ),
  ];
}

export const APPLIED_ONCE_PER_TARGET_RULE = appliedOncePerTargetRule({
  id: "applied-once-per-target",
  label: "Isn't already on the question or task",
  condition: "The question or task already has it",
});
