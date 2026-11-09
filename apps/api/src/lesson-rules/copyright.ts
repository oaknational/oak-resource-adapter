import type {
  LessonEligibilityFacts,
  RestrictionLevel,
} from "@oaknational/resource-adapter-curriculum";

export type CopyrightRule = Readonly<{
  restrictedLevels: readonly RestrictionLevel[];
  conflictFeatureKeys: readonly string[];
}>;

export const COPYRIGHT_RULE: CopyrightRule = {
  restrictedLevels: ["restricted", "highly-restricted"],
  conflictFeatureKeys: ["has_copyright_conflict"],
};

export type CopyrightRefusalReason =
  | "no-restriction-levels"
  | "copyright-conflict"
  | "restricted-works"
  | "restricted-media"
  | "restricted-downloadable-files";

export function copyrightRefusalReason(
  { restrictionLevels }: LessonEligibilityFacts,
  rule: CopyrightRule = COPYRIGHT_RULE,
): CopyrightRefusalReason | null {
  const isRestricted = (level: RestrictionLevel) =>
    rule.restrictedLevels.includes(level);

  if (restrictionLevels === null) {
    return "no-restriction-levels";
  }
  if (
    restrictionLevels.featureKeys.some((key) => rule.conflictFeatureKeys.includes(key))
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
}
