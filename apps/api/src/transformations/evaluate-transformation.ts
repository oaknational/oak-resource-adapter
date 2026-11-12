import type { RuleRefusal } from "../rules/rule";
import { withoutSupportLevels } from "./narrowing";
import { commonTransformationRules } from "./rules/common-rules";
import type {
  TransformationAvailabilityContext,
  TransformationDefinition,
  TransformationRule,
} from "./types";

export type TransformationRefusal = RuleRefusal<"transformation", TransformationRule>;

export type TransformationEvaluation =
  | Readonly<{ offered: TransformationDefinition }>
  | Readonly<{ refusal: TransformationRefusal }>;

/** Every rule a kind is checked against, in order. */
export function transformationRulesFor(
  definition: TransformationDefinition,
): readonly TransformationRule[] {
  return [...commonTransformationRules(definition), ...definition.rules];
}

/** The definition comes back narrowed by any rule that removed support levels. */
export function evaluateTransformation(
  definition: TransformationDefinition,
  context: TransformationAvailabilityContext,
): TransformationEvaluation {
  let offered = definition;
  for (const rule of transformationRulesFor(definition)) {
    const reason = rule.check({ ...context, definition: offered });
    if (reason === null) {
      continue;
    }
    const narrowed =
      rule.removesSupportLevels === undefined
        ? null
        : withoutSupportLevels(offered, rule.removesSupportLevels);
    if (narrowed === null) {
      return { refusal: { level: "transformation", rule: rule.id, reason } };
    }
    offered = narrowed;
  }
  return { offered };
}
