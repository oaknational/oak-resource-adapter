import {
  getResourceNodeById,
  getResourceNodesByType,
} from "@oaknational/resource-document";

import { defineRule, type RuleMetadata } from "../../rules/rule";
import { readableSlug } from "../../rules/rule-presentation";
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
  metadata: RuleMetadata<TId>,
  config: Readonly<{ target: TransformationTarget }>,
) {
  return defineRule({
    ...metadata,
    kind: "target",
    config,
    displayValuesLabel: "Applies to",
    displayValues:
      config.target.scope === "document"
        ? ["The whole resource"]
        : config.target.nodeTypes.map(readableSlug),
    reads: ["resource"],
    check: (context: TargetContext) =>
      hasEligibleTarget(config.target, context) ? null : "no-eligible-target",
  });
}
