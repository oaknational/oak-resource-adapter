import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext } from "../types";

export function excludesRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ kinds: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "excludes",
    config,
    displayValuesLabel: "Can't be combined with",
    displayValues: config.kinds,
    reads: ["adaptation"],
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
