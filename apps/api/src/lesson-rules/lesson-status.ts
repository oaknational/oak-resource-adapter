import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

export type LessonStatusRule = Readonly<{ expiredFeatureKey: string }>;

export const LESSON_STATUS_RULE: LessonStatusRule = { expiredFeatureKey: "expired" };

export type LessonStatusRefusalReason = "unpublished" | "legacy" | "expired";

export function lessonStatusRefusalReason(
  facts: LessonEligibilityFacts,
  rule: LessonStatusRule = LESSON_STATUS_RULE,
): LessonStatusRefusalReason | null {
  if (facts.legacy) {
    return "legacy";
  }
  if (facts.restrictionLevels?.featureKeys.includes(rule.expiredFeatureKey)) {
    return "expired";
  }
  return null;
}
