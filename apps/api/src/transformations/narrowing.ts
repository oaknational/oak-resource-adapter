import type { LessonFactsContext } from "../rules/context";
import type { Rule } from "../rules/rule";
import { SUPPORT_LEVEL_INPUT_ID, supportLevelInput } from "./define-transformation";
import { offeredParamsSchema } from "./offered-params";
import type { SupportLevel, SupportLevelOptions } from "./support-level";
import type { NarrowingRule, TransformationDefinition } from "./types";

export function removingSupportLevels<const TRule extends Rule<LessonFactsContext>>(
  removesSupportLevels: NarrowingRule["removesSupportLevels"],
  rule: TRule,
): TRule & Pick<NarrowingRule, "removesSupportLevels"> {
  return { ...rule, removesSupportLevels };
}

/** `null` when no level would remain. */
export function withoutSupportLevels(
  definition: TransformationDefinition,
  removed: readonly SupportLevel[],
): TransformationDefinition | null {
  const [first, ...rest] = (definition.supportLevels ?? []).filter(
    ({ level }) => !removed.includes(level),
  );
  if (first === undefined) {
    return null;
  }
  const supportLevels: SupportLevelOptions = [first, ...rest];
  const inputs = (definition.inputs ?? []).map((input) =>
    input.id === SUPPORT_LEVEL_INPUT_ID ? supportLevelInput(supportLevels) : input,
  );
  return {
    ...definition,
    inputs,
    params: offeredParamsSchema(definition, inputs),
    supportLevels,
  };
}
