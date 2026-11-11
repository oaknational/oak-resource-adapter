import type { LessonFactsContext } from "./context";
import { defineRule, type RuleMetadata } from "./rule";

/** Matches Oak's labels exactly. */
export function contentGuidanceRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ labels: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "content-guidance",
    config,
    displayValues: config.labels,
    reads: ["lesson"],
    check: ({ facts }: LessonFactsContext) =>
      facts?.contentGuidance.some((label) => config.labels.includes(label))
        ? "content-guidance"
        : null,
  });
}
