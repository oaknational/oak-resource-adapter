import type { LessonFactsContext } from "./context";
import { readableSlug } from "./rule-presentation";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches the programme the lesson was opened in, not every programme it is taught in. */
export function subjectKeyStageRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{
    subjectSlugs: readonly string[];
    keyStageSlugs: readonly string[];
  }>,
) {
  return defineRule({
    ...metadata,
    kind: "subject-key-stage",
    config,
    displayValues: config.subjectSlugs.map(readableSlug),
    displayValuesLabel: `At ${config.keyStageSlugs.map((slug) => slug.toUpperCase()).join(", ")}`,
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) =>
      facts !== null &&
      config.subjectSlugs.includes(facts.programme.subjectSlug) &&
      config.keyStageSlugs.includes(facts.programme.keyStageSlug)
        ? "subject-key-stage"
        : null,
  });
}
