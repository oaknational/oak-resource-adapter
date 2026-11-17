import type { LessonFactsContext } from "./context";
import { defineRule, type RuleMetadata } from "./rule";

export function pePracticalRule<const TId extends string>(metadata: RuleMetadata<TId>) {
  return defineRule({
    ...metadata,
    kind: "pe-practical",
    config: {},
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) =>
      facts?.pePractical ? "pe-practical" : null,
  });
}
