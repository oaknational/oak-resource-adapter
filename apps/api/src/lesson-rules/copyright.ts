import type { RestrictionLevel } from "@oaknational/resource-adapter-curriculum";

import type { LessonFactsContext } from "../rules/context";
import { defineRule, type RuleMetadata } from "../rules/rule";

/** A lesson with no published restriction levels cannot be judged, so it is refused. */
export function copyrightRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{
    restrictedLevels: readonly RestrictionLevel[];
    conflictFeatureKeys: readonly string[];
  }>,
) {
  const isRestricted = (level: RestrictionLevel) =>
    config.restrictedLevels.includes(level);

  return defineRule({
    id,
    kind: "copyright",
    description,
    config,
    check: ({ facts }: LessonFactsContext) => {
      const restrictionLevels = facts?.restrictionLevels;
      if (restrictionLevels === undefined) {
        return null;
      }
      if (restrictionLevels === null) {
        return "no-restriction-levels";
      }
      if (
        restrictionLevels.featureKeys.some((key) =>
          config.conflictFeatureKeys.includes(key),
        )
      ) {
        return "copyright-conflict";
      }
      if (restrictionLevels.works.some(isRestricted)) {
        return "restricted-works";
      }
      if (restrictionLevels.media.some(isRestricted)) {
        return "restricted-media";
      }
      if (restrictionLevels.downloadableFiles.some(isRestricted)) {
        return "restricted-downloadable-files";
      }
      return null;
    },
  });
}
