import type { LessonFactsContext } from "./context";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches Oak's category labels exactly, on any unit the lesson is taught in. */
export function subjectCategoryRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ categories: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "subject-category",
    config,
    displayValues: config.categories,
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) =>
      facts?.subjectCategories.some((category) => config.categories.includes(category))
        ? "excluded-subject-category"
        : null,
  });
}
