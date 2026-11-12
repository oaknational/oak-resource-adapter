import type { LessonFactsContext } from "../rules/context";
import { defineRule, type RuleMetadata } from "../rules/rule";
import type { TeacherContext } from "./context";

export function geoRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ featureKey: string }>,
) {
  return defineRule({
    ...metadata,
    kind: "geo",
    config,
    reads: ["lesson", "teacher"],
    check: ({ facts, teacher }: LessonFactsContext & TeacherContext) =>
      (facts?.restrictionLevels?.featureKeys.includes(config.featureKey) ?? false) &&
      teacher !== undefined &&
      !teacher.inCopyrightRegion
        ? "outside-copyright-region"
        : null,
  });
}
