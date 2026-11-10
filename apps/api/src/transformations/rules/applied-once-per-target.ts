import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext } from "../types";

export function appliedOncePerTargetRule<const TId extends string>({
  id,
  description,
}: RuleMetadata<TId>) {
  return defineRule({
    id,
    kind: "applied-once-per-target",
    description,
    config: {},
    reads: ["adaptation"],
    check: ({
      appliedTransformations,
      definition,
      targetBlockId,
    }: TransformationRuleContext) =>
      appliedTransformations.some(
        (applied) =>
          applied.kind === definition.kind && applied.targetBlockId === targetBlockId,
      )
        ? "already-applied"
        : null,
  });
}
