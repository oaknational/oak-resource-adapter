import type { LessonFactsContext } from "../rules/context";
import { defineRule, type RulePlacement } from "../rules/rule";
import type { TeacherContext } from "./context";

export function geoRule<const TId extends string>(
  { id, description }: RulePlacement<TId>,
  config: Readonly<{ featureKey: string }>,
) {
  return defineRule({
    id,
    kind: "geo",
    description,
    config,
    check: ({ facts, teacher }: LessonFactsContext & TeacherContext) =>
      (facts?.restrictionLevels?.featureKeys.includes(config.featureKey) ?? false) &&
      teacher !== undefined &&
      !teacher.inCopyrightRegion
        ? "outside-copyright-region"
        : null,
  });
}
