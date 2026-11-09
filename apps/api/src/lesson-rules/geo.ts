import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

import type { TeacherAccess } from "../teacher-access/access";

export type GeoRule = Readonly<{ featureKey: string }>;

export const GEO_RULE: GeoRule = { featureKey: "agf__geo_restricted" };

export type GeoRefusalReason = "outside-copyright-region";

/** `teacher` is `undefined` when signed out: signing in may unlock the lesson. */
export function geoRefusalReason(
  { restrictionLevels }: LessonEligibilityFacts,
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined,
  rule: GeoRule = GEO_RULE,
): GeoRefusalReason | null {
  const restricted = restrictionLevels?.featureKeys.includes(rule.featureKey) ?? false;
  return restricted && teacher !== undefined && !teacher.inCopyrightRegion
    ? "outside-copyright-region"
    : null;
}
