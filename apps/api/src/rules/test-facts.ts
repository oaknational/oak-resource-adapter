import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

export function lessonFacts(
  overrides: Partial<LessonEligibilityFacts> = {},
): LessonEligibilityFacts {
  return {
    lessonUid: "LESS-ABCDE-F0001",
    programme: { subjectSlug: "english", keyStageSlug: "ks2" },
    restrictionLevels: null,
    subjectSlugs: ["english"],
    subjectCategories: [],
    pePractical: false,
    legacy: false,
    contentGuidance: [],
    ...overrides,
  };
}
