import type { LessonFactsContext } from "../rules/context";
import { defineRule, type RuleMetadata } from "../rules/rule";

export function lessonStatusRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ expiredFeatureKey: string }>,
) {
  return defineRule({
    ...metadata,
    kind: "lesson-status",
    config,
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) => {
      if (facts === null) {
        return "unpublished";
      }
      if (facts.legacy) {
        return "legacy";
      }
      if (facts.restrictionLevels?.featureKeys.includes(config.expiredFeatureKey)) {
        return "expired";
      }
      return null;
    },
  });
}
