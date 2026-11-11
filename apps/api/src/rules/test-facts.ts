import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

export function lessonFacts(
  overrides: Partial<LessonEligibilityFacts> = {},
): LessonEligibilityFacts {
  return {
    restrictionLevels: null,
    subjectSlugs: ["english"],
    subjectCategories: [],
    legacy: false,
    contentGuidance: [],
    ...overrides,
  };
}
