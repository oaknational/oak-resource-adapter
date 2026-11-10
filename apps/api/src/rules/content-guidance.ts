import type { LessonFactsContext } from "./context";
import { defineRule, type RulePlacement } from "./rule";

/** Matches Oak's labels exactly. */
export function contentGuidanceRule<const TId extends string>(
  { id, description }: RulePlacement<TId>,
  config: Readonly<{ labels: readonly string[] }>,
) {
  return defineRule({
    id,
    kind: "content-guidance",
    description,
    config,
    check: ({ facts }: LessonFactsContext) =>
      facts?.contentGuidance.some((label) => config.labels.includes(label))
        ? "content-guidance"
        : null,
  });
}
