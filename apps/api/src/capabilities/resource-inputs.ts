import { defineRule, type RuleMetadata } from "../rules/rule";
import type { EligibilityContext } from "./types";

export function resourceInputsRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ resourceType: string }>,
) {
  return defineRule({
    ...metadata,
    kind: "resource-inputs",
    config,
    reads: ["lesson"],
    check: ({
      originalFileResourceTypes,
      extractedResourceTypes,
    }: Pick<
      EligibilityContext,
      "extractedResourceTypes" | "originalFileResourceTypes"
    >) => {
      if (!originalFileResourceTypes.includes(config.resourceType)) {
        return "no-original-file";
      }
      if (!extractedResourceTypes.includes(config.resourceType)) {
        return "not-extracted";
      }
      return null;
    },
  });
}
