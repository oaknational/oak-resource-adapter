import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

/** `null` when there is no published lesson to read facts from. */
export type LessonFactsContext = Readonly<{ facts: LessonEligibilityFacts | null }>;

/** `null` without a lesson, as on dev routes. */
export type LessonIdentityContext = Readonly<{
  lesson: Readonly<{ lessonSlug: string }> | null;
}>;
