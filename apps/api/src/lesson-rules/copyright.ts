import {
  RESTRICTION_LEVEL_COLUMNS,
  RESTRICTION_LEVELS_VIEW,
  type RestrictionLevel,
} from "@oaknational/resource-adapter-curriculum";

import type { LessonFactsContext } from "../rules/context";
import { code, readableSlug } from "../rules/rule-presentation";
import { defineRule, type RuleMetadata } from "../rules/rule";

/** A lesson with no published restriction levels cannot be judged, so it is refused. */
export function copyrightRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{
    restrictedLevels: readonly RestrictionLevel[];
    conflictFeatureKeys: readonly string[];
  }>,
) {
  const isRestricted = (level: RestrictionLevel) =>
    config.restrictedLevels.includes(level);

  const { downloadableFiles, featureKeys, media, works } = RESTRICTION_LEVEL_COLUMNS;

  return defineRule({
    ...metadata,
    kind: "copyright",
    config,
    source: `Oak's ${code(RESTRICTION_LEVELS_VIEW)} view, with every published row for the lesson combined`,
    checks: [
      "The view has no published row for the lesson",
      `Its ${code(featureKeys)} include ${config.conflictFeatureKeys.map(code).join(" or ")}`,
      `Its works (${code(works)}), media (${code(media)}) or downloadable files (${code(downloadableFiles)}) are ${config.restrictedLevels.map(readableSlug).join(" or ")}`,
    ],
    reads: ["lesson"],
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
