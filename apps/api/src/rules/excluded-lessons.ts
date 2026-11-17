import type { LessonFactsContext, LessonIdentityContext } from "./context";
import { readableSlug } from "./rule-presentation";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches a listed lesson in whichever programme it is opened from. */
export function excludedLessonsRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ lessonSlugs: readonly string[]; lessonUids: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "excluded-lessons",
    config,
    displayValues: [
      ...config.lessonSlugs.map(readableSlug),
      ...(config.lessonUids.length === 0
        ? []
        : [`${config.lessonUids.length} lesson IDs, listed in the config`]),
    ],
    reads: ["lesson"],
    check: ({ facts, lesson }: LessonIdentityContext & LessonFactsContext) =>
      (lesson !== null && config.lessonSlugs.includes(lesson.lessonSlug)) ||
      (facts !== null && config.lessonUids.includes(facts.lessonUid))
        ? "excluded-lesson"
        : null,
  });
}
