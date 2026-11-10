import type { LessonFactsContext } from "./context";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches a lesson taught in any listed subject, across all its programmes. */
export function subjectRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ subjectSlugs: readonly string[] }>,
) {
  return defineRule({
    id,
    kind: "subject",
    description,
    config,
    check: ({ facts }: LessonFactsContext) =>
      facts?.subjectSlugs.some((slug) => config.subjectSlugs.includes(slug))
        ? "excluded-subject"
        : null,
  });
}
