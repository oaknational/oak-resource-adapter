import {
  getResourceNodeById,
  getResourceNodesByType,
} from "@oaknational/resource-document";

import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext, TransformationTarget } from "../types";

type TargetContext = Pick<TransformationRuleContext, "document" | "targetBlockId">;

function hasEligibleTarget(
  target: TransformationTarget,
  { document, targetBlockId }: TargetContext,
): boolean {
  if (target.scope === "document") {
    return targetBlockId === undefined;
  }
  if (targetBlockId !== undefined) {
    const node = getResourceNodeById(document, targetBlockId);
    return node !== undefined && target.nodeTypes.includes(node.type);
  }
  return target.nodeTypes.some(
    (type) => getResourceNodesByType(document, type).length > 0,
  );
}

export function targetRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ target: TransformationTarget }>,
) {
  return defineRule({
    id,
    kind: "target",
    description,
    config,
    check: (context: TargetContext) =>
      hasEligibleTarget(config.target, context) ? null : "no-eligible-target",
  });
}
