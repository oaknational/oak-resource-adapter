import type { LessonIdentityContext } from "./context";
import { defineRule, type RulePlacement } from "./rule";

/** Matches a listed lesson in whichever programme it is opened from. */
export function excludedLessonsRule<const TId extends string>(
  { id, description }: RulePlacement<TId>,
  config: Readonly<{ lessonSlugs: readonly string[] }>,
) {
  return defineRule({
    id,
    kind: "excluded-lessons",
    description,
    config,
    check: ({ lesson }: LessonIdentityContext) =>
      config.lessonSlugs.includes(lesson.lessonSlug) ? "excluded-lesson" : null,
  });
}
