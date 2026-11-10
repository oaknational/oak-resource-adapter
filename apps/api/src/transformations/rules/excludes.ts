import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext } from "../types";

export function excludesRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ kinds: readonly string[] }>,
) {
  return defineRule({
    id,
    kind: "excludes",
    description,
    config,
    check: ({
      appliedTransformations,
      targetBlockId,
    }: Pick<TransformationRuleContext, "appliedTransformations" | "targetBlockId">) =>
      appliedTransformations.some(
        ({ kind, targetBlockId: appliedTarget }) =>
          appliedTarget === targetBlockId && config.kinds.includes(kind),
      )
        ? "excluded-kind-applied"
        : null,
  });
}
