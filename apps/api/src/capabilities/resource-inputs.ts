import { defineRule, type RuleMetadata } from "../rules/rule";
import type { EligibilityContext } from "./types";

export function resourceInputsRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ resourceType: string }>,
) {
  return defineRule({
    id,
    kind: "resource-inputs",
    description,
    config,
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
