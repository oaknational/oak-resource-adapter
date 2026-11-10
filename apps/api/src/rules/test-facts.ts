import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

export function lessonFacts(
  overrides: Partial<LessonEligibilityFacts> = {},
): LessonEligibilityFacts {
  return {
    restrictionLevels: null,
    subjectSlugs: ["english"],
    legacy: false,
    contentGuidance: [],
    ...overrides,
  };
}
