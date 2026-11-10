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
        description: "Refuses a transformation that is a draft or retired.",
      },
      { offeredStatuses: ["active"] },
    ),
    materialSourceRule(
      {
        id: "material-source",
        description:
          "Refuses a transformation whose required lesson material has no source.",
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
        description:
          "Refuses a transformation with nothing in the resource it can change.",
      },
      { target: definition.target },
    ),
    excludesRule(
      {
        id: "excludes",
        description:
          "Refuses a transformation on a target that already carries one it cannot share with.",
      },
      { kinds: definition.excludes ?? [] },
    ),
  ];
}

export const APPLIED_ONCE_PER_TARGET_RULE = appliedOncePerTargetRule({
  id: "applied-once-per-target",
  description: "Refuses a target that already carries this transformation.",
});
