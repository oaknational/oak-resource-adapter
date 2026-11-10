import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext, TransformationStatus } from "../types";

export function statusRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ offeredStatuses: readonly TransformationStatus[] }>,
) {
  return defineRule({
    id,
    kind: "status",
    description,
    config,
    check: ({ definition }: Pick<TransformationRuleContext, "definition">) =>
      config.offeredStatuses.includes(definition.status) ? null : definition.status,
  });
}
