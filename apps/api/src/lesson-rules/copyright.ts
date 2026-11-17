import {
  RESTRICTION_LEVEL_COLUMNS,
  RESTRICTION_LEVELS_VIEW,
  type RestrictionLevel,
} from "@oaknational/resource-adapter-curriculum";

import type { LessonFactsContext } from "../rules/context";
import { code, readableSlug } from "../rules/rule-presentation";
import { defineRule, type RuleMetadata } from "../rules/rule";

const RESTRICTED_CATEGORIES = {
  works: { name: "works", reason: "restricted-works" },
  media: { name: "media", reason: "restricted-media" },
  downloadableFiles: {
    name: "downloadable files",
    reason: "restricted-downloadable-files",
  },
} as const;

type RestrictedCategory = keyof typeof RESTRICTED_CATEGORIES;

function joinWithOr(items: readonly string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}

/** A lesson with no published restriction levels cannot be judged, so it is refused. */
export function copyrightRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{
    restrictedLevels: readonly RestrictionLevel[];
    restrictedCategories: readonly RestrictedCategory[];
    conflictFeatureKeys: readonly string[];
  }>,
) {
  const isRestricted = (level: RestrictionLevel) =>
    config.restrictedLevels.includes(level);
  const categories = (
    Object.keys(RESTRICTED_CATEGORIES) as RestrictedCategory[]
  ).filter((category) => config.restrictedCategories.includes(category));
  const categoryNames = categories.map(
    (category) =>
      `${RESTRICTED_CATEGORIES[category].name} (${code(RESTRICTION_LEVEL_COLUMNS[category])})`,
  );

  return defineRule({
    ...metadata,
    kind: "copyright",
    config,
    source: `Oak's ${code(RESTRICTION_LEVELS_VIEW)} view, with every published row for the lesson combined`,
    checks: [
      "The view has no published row for the lesson",
      `Its ${code(RESTRICTION_LEVEL_COLUMNS.featureKeys)} include ${config.conflictFeatureKeys.map(code).join(" or ")}`,
      ...(categories.length === 0
        ? []
        : [
            `Its ${joinWithOr(categoryNames)} are ${config.restrictedLevels.map(readableSlug).join(" or ")}`,
          ]),
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
      const restricted = categories.find((category) =>
        restrictionLevels[category].some(isRestricted),
      );
      return restricted === undefined ? null : RESTRICTED_CATEGORIES[restricted].reason;
    },
  });
}
