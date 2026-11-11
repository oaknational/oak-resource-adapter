import type {
  EligibilityEvaluationRequest,
  EligibilityEvaluationResponse,
  RuleCatalogue,
  RuleDescription,
} from "@oaknational/resource-adapter-dev-api-contracts";

import { capabilityDefinitions } from "../capabilities/registry";
import { explainEligibility, resolveEligibility } from "../capabilities/service";
import { LESSON_MATERIALS_RULE } from "../lesson-rules/lesson-materials";
import { LESSON_RULES } from "../lesson-rules/rules";
import type { Rule } from "../rules/rule";
import { transformationRulesFor } from "../transformations/evaluate-transformation";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
} from "../transformations/registry";
import type {
  TransformationDefinition,
  TransformationRule,
} from "../transformations/types";
import { ACCOUNT_GATES, accessPolicies } from "./account";

function describeRule(rule: Rule<never> | TransformationRule): RuleDescription {
  const {
    checks,
    condition,
    config,
    description,
    displayValues,
    displayValuesLabel,
    id,
    kind,
    label,
    reads,
    source,
  } = rule;
  return {
    config,
    ...(description === undefined ? {} : { description }),
    id,
    kind,
    label,
    ...(displayValues === undefined ? {} : { displayValues }),
    ...(displayValuesLabel === undefined ? {} : { displayValuesLabel }),
    ...(source === undefined ? {} : { source }),
    ...(checks === undefined ? {} : { checks }),
    reads,
    condition,
    ...("removesSupportLevels" in rule && rule.removesSupportLevels !== undefined
      ? { removesSupportLevels: rule.removesSupportLevels }
      : {}),
  };
}

/** The excludes rule lists kinds, which only the registry can name for a reader. */
function withKindLabels(rule: RuleDescription): RuleDescription {
  if (rule.kind !== "excludes" || rule.displayValues === undefined) {
    return rule;
  }
  return {
    ...rule,
    displayValues: rule.displayValues.map((kind) =>
      isRegisteredTransformationKind(kind)
        ? transformationDefinitions[kind].label
        : kind,
    ),
  };
}

export function getDevRuleCatalogue(): RuleCatalogue {
  const capabilities = Object.values(capabilityDefinitions);
  return {
    access: accessPolicies(),
    gates: ACCOUNT_GATES,
    lesson: LESSON_RULES.map(describeRule),
    lessonMaterials: [LESSON_MATERIALS_RULE],
    capabilities: capabilities.map(({ id, label, rules }) => ({
      id,
      label,
      rules: rules.map(describeRule),
    })),
    transformations: Object.values(transformationDefinitions).map(
      (definition: TransformationDefinition) => ({
        capabilityIds: capabilities
          .filter(({ transformationKinds }) =>
            (transformationKinds as readonly string[]).includes(definition.kind),
          )
          .map(({ id }) => id),
        ...(definition.inputs === undefined ? {} : { inputs: definition.inputs }),
        kind: definition.kind,
        label: definition.label,
        rules: transformationRulesFor(definition).map(describeRule).map(withKindLabels),
        status: definition.status,
      }),
    ),
  };
}

export async function evaluateDevEligibility({
  lesson,
  teacher,
}: EligibilityEvaluationRequest): Promise<EligibilityEvaluationResponse> {
  return explainEligibility(
    Object.values(capabilityDefinitions),
    await resolveEligibility(lesson),
    teacher,
  );
}
