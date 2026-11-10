import type { LessonIdentityContext } from "./context";
import { readableSlug } from "./rule-presentation";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches a listed lesson in whichever programme it is opened from. */
export function excludedLessonsRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ lessonSlugs: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "excluded-lessons",
    config,
    displayValues: config.lessonSlugs.map(readableSlug),
    reads: ["lesson"],
    check: ({ lesson }: LessonIdentityContext) =>
      lesson !== null && config.lessonSlugs.includes(lesson.lessonSlug)
        ? "excluded-lesson"
        : null,
  });
}
