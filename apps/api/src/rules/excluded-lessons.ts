import type { LessonIdentityContext } from "./context";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches a listed lesson in whichever programme it is opened from. */
export function excludedLessonsRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ lessonSlugs: readonly string[] }>,
) {
  return defineRule({
    id,
    kind: "excluded-lessons",
    description,
    config,
    check: ({ lesson }: LessonIdentityContext) =>
      lesson !== null && config.lessonSlugs.includes(lesson.lessonSlug)
        ? "excluded-lesson"
        : null,
  });
}
