import type { LessonFactsContext } from "./context";
import { readableSlug } from "./rule-presentation";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches a lesson taught in any listed subject, across all its programmes. */
export function subjectRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ subjectSlugs: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "subject",
    config,
    displayValues: config.subjectSlugs.map(readableSlug),
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) =>
      facts?.subjectSlugs.some((slug) => config.subjectSlugs.includes(slug))
        ? "excluded-subject"
        : null,
  });
}
