import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext, TransformationStatus } from "../types";

export function statusRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ offeredStatuses: readonly TransformationStatus[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "status",
    config,
    reads: [],
    check: ({ definition }: Pick<TransformationRuleContext, "definition">) =>
      config.offeredStatuses.includes(definition.status) ? null : definition.status,
  });
}
